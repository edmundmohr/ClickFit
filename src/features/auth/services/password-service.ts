import { and, eq, ne } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { account, session, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { hashPassword, isPasswordLengthValid, verifyPassword } from "@/lib/auth/password";
import { canSetPasswordFor, type Actor } from "@/domain/permissions/user-management";
import { CREDENTIAL_PROVIDER_ID } from "./user-factory";

const credentialAccountWhere = (userId: string) =>
  and(eq(account.userId, userId), eq(account.providerId, CREDENTIAL_PROVIDER_ID));

async function setPasswordHash(db: AppDatabase, userId: string, password: string): Promise<void> {
  if (!isPasswordLengthValid(password)) throw new AppError("PASSWORD_TOO_SHORT");
  const hash = await hashPassword(password);
  await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(credentialAccountWhere(userId));
}

export async function verifyUserPassword(
  db: AppDatabase,
  userId: string,
  password: string,
): Promise<boolean> {
  const credential = await db.query.account.findFirst({
    columns: { password: true },
    where: credentialAccountWhere(userId),
  });
  if (!credential?.password) return false;
  return verifyPassword({ hash: credential.password, password });
}

/** Ändert das eigene Passwort nach Prüfung des aktuellen; andere Sitzungen werden abgemeldet. */
export async function changeOwnPassword(
  db: AppDatabase,
  input: { userId: string; currentPassword: string; newPassword: string; keepSessionToken: string },
): Promise<void> {
  if (!(await verifyUserPassword(db, input.userId, input.currentPassword))) {
    throw new AppError("WRONG_PASSWORD");
  }
  await setPasswordHash(db, input.userId, input.newPassword);
  await db
    .delete(session)
    .where(and(eq(session.userId, input.userId), ne(session.token, input.keepSessionToken)));
}

/** Admin setzt ein neues Passwort für einen anderen Nutzer; dieser wird überall abgemeldet. */
export async function setPasswordAsAdmin(
  db: AppDatabase,
  actor: Actor,
  input: { targetUserId: string; newPassword: string },
): Promise<void> {
  const permission = canSetPasswordFor(actor, input.targetUserId);
  if (!permission.allowed) throw new AppError(permission.reason);
  const target = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.id, input.targetUserId),
  });
  if (!target) throw new AppError("NOT_FOUND");
  await setPasswordHash(db, input.targetUserId, input.newPassword);
  await db.delete(session).where(eq(session.userId, input.targetUserId));
}
