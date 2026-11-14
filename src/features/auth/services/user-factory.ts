import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { account, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { hashPassword, isPasswordLengthValid } from "@/lib/auth/password";
import { newId } from "@/lib/tokens";
import type { Role } from "@/domain/permissions/user-management";

export const CREDENTIAL_PROVIDER_ID = "credential";

/** Better Auth verlangt eine E-Mail; angemeldet wird per Benutzername, daher nur ein Platzhalter. */
export function placeholderEmail(username: string): string {
  return `${normalizeUsername(username)}@users.clickfit.invalid`;
}

/** Gleiche Normalisierung wie im Username-Plugin von Better Auth (Groß-/Kleinschreibung egal). */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

export interface NewUserInput {
  username: string;
  password: string;
  role: Role;
  name?: string;
}

export async function isUsernameTaken(db: AppDatabase, username: string): Promise<boolean> {
  const existing = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.username, normalizeUsername(username)),
  });
  return existing !== undefined;
}

/** Legt Nutzer und Passwort-Konto (Better Auth) in einem atomaren D1-Batch an. */
export async function createUserWithPassword(
  db: AppDatabase,
  input: NewUserInput,
): Promise<{ id: string }> {
  if (!isPasswordLengthValid(input.password)) throw new AppError("PASSWORD_TOO_SHORT");
  if (await isUsernameTaken(db, input.username)) throw new AppError("USERNAME_TAKEN");

  const id = newId();
  const now = new Date();
  const displayUsername = input.username.trim();
  await db.batch([
    db.insert(user).values({
      id,
      name: input.name?.trim() || displayUsername,
      email: placeholderEmail(input.username),
      emailVerified: false,
      username: normalizeUsername(input.username),
      displayUsername,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(account).values({
      id: newId(),
      accountId: id,
      providerId: CREDENTIAL_PROVIDER_ID,
      userId: id,
      password: await hashPassword(input.password),
      createdAt: now,
      updatedAt: now,
    }),
  ]);
  return { id };
}
