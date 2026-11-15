/**
 * Nutzerverwaltung durch den Admin: Konten anlegen, ändern und löschen.
 * Angemeldet wird weiter nur per Benutzername; eine echte E-Mail gibt es nicht.
 */
import { and, eq, ne } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { progressPhoto, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { passwordCheckKey, resetAttempts } from "@/lib/auth/attempt-limit";
import {
  canChangeRoleOf,
  canDeleteUser,
  canManageUsers,
  isValidUsername,
  type Actor,
  type Role,
} from "@/domain/permissions/user-management";
import {
  createUserWithPassword,
  normalizeUsername,
  placeholderEmail,
} from "@/features/auth/services/user-factory";

/** R2 löscht höchstens 1000 Objekte pro Aufruf. */
const R2_DELETE_BATCH = 1000;

export interface CreateUserInput {
  username: string;
  name?: string;
  password: string;
  role: Role;
}

export async function createUserAsAdmin(
  db: AppDatabase,
  actor: Actor,
  input: CreateUserInput,
): Promise<{ id: string }> {
  const permission = canManageUsers(actor);
  if (!permission.allowed) throw new AppError(permission.reason);
  const username = input.username.trim();
  if (!isValidUsername(username)) throw new AppError("USERNAME_INVALID");
  return createUserWithPassword(db, { ...input, username });
}

export interface UpdateUserInput {
  targetUserId: string;
  username: string;
  name: string;
  role: Role;
}

/** Ändert Anzeigename, Benutzername und Rolle. Die eigene Rolle bleibt, wie sie ist. */
export async function updateUserAsAdmin(db: AppDatabase, actor: Actor, input: UpdateUserInput): Promise<void> {
  const permission = canManageUsers(actor);
  if (!permission.allowed) throw new AppError(permission.reason);
  const target = await db.query.user.findFirst({
    columns: { id: true, role: true },
    where: eq(user.id, input.targetUserId),
  });
  if (!target) throw new AppError("NOT_FOUND");
  if (input.role !== target.role) {
    const rolePermission = canChangeRoleOf(actor, target.id);
    if (!rolePermission.allowed) throw new AppError(rolePermission.reason);
  }

  const displayUsername = input.username.trim();
  if (!isValidUsername(displayUsername)) throw new AppError("USERNAME_INVALID");
  const username = normalizeUsername(displayUsername);
  const taken = await db.query.user.findFirst({
    columns: { id: true },
    where: and(eq(user.username, username), ne(user.id, target.id)),
  });
  if (taken) throw new AppError("USERNAME_TAKEN");

  await db
    .update(user)
    .set({
      name: input.name.trim() || displayUsername,
      username,
      displayUsername,
      // Die Platzhalter-Adresse folgt dem Benutzernamen, sonst bliebe der alte Name belegt.
      email: placeholderEmail(username),
      role: input.role,
      updatedAt: new Date(),
    })
    .where(eq(user.id, target.id));
}

/**
 * Löscht ein Konto mit allen Daten. Zuerst die Fotodateien im Bucket, dann der Nutzer:
 * Alle Tabellen hängen per `ON DELETE CASCADE` am Nutzer. Scheitert der zweite Schritt,
 * lässt sich das Löschen einfach wiederholen – es bleiben keine Dateien ohne Besitzer zurück.
 */
export async function deleteUserAsAdmin(
  db: AppDatabase,
  bucket: R2Bucket,
  actor: Actor,
  targetUserId: string,
): Promise<void> {
  const permission = canDeleteUser(actor, targetUserId);
  if (!permission.allowed) throw new AppError(permission.reason);
  const target = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.id, targetUserId),
  });
  if (!target) throw new AppError("NOT_FOUND");

  const photos = await db.query.progressPhoto.findMany({
    columns: { r2Key: true },
    where: eq(progressPhoto.userId, target.id),
  });
  const keys = photos.map((photo) => photo.r2Key);
  for (let start = 0; start < keys.length; start += R2_DELETE_BATCH) {
    await bucket.delete(keys.slice(start, start + R2_DELETE_BATCH));
  }
  await db.delete(user).where(eq(user.id, target.id));
  await resetAttempts(db, passwordCheckKey(target.id));
}
