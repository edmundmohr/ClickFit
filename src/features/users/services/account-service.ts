import { asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { canViewUserList, isRole, type Actor, type Role } from "@/domain/permissions/user-management";

export const THEMES = ["system", "light", "dark"] as const;
export type Theme = (typeof THEMES)[number];
export const UNIT_SYSTEMS = ["metric", "imperial"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export async function updateDisplayName(db: AppDatabase, userId: string, name: string): Promise<void> {
  await db.update(user).set({ name: name.trim(), updatedAt: new Date() }).where(eq(user.id, userId));
}

export async function updatePreferences(
  db: AppDatabase,
  userId: string,
  input: { theme: Theme; unitSystem: UnitSystem },
): Promise<void> {
  await db
    .update(user)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(user.id, userId));
}

export interface UserListItem {
  id: string;
  name: string;
  username: string;
  role: Role;
}

export async function listUsers(db: AppDatabase, actor: Actor): Promise<UserListItem[]> {
  const permission = canViewUserList(actor);
  if (!permission.allowed) throw new AppError(permission.reason);
  const rows = await db.query.user.findMany({
    columns: { id: true, name: true, displayUsername: true, role: true },
    orderBy: asc(user.createdAt),
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    username: row.displayUsername,
    role: isRole(row.role) ? row.role : "user",
  }));
}

export interface UserDataExport {
  format: "clickfit-export";
  version: 1;
  exportedAt: string;
  profile: {
    username: string;
    name: string;
    theme: string;
    unitSystem: string;
    createdAt: string;
  };
}

/** Sammelt alle Daten des Nutzers. Spätere Phasen hängen hier ihre Bereiche an. */
export async function exportOwnData(db: AppDatabase, userId: string): Promise<UserDataExport> {
  const self = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!self) throw new AppError("NOT_FOUND");
  return {
    format: "clickfit-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      username: self.displayUsername,
      name: self.name,
      theme: self.theme,
      unitSystem: self.unitSystem,
      createdAt: self.createdAt.toISOString(),
    },
  };
}
