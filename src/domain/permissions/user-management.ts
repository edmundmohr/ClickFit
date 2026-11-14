/**
 * Reine Rechte-Regeln für die (bewusst kleine) Nutzerverwaltung.
 * Kein Framework- oder Datenbankzugriff, damit sich die Regeln isoliert testen lassen.
 */

export const ROLES = ["admin", "user"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export interface Actor {
  id: string;
  role: Role;
}

export type PermissionDenial = "NOT_ADMIN" | "SELF_NOT_ALLOWED";

export type PermissionResult = { allowed: true } | { allowed: false; reason: PermissionDenial };

export function isAdmin(actor: Actor | null | undefined): boolean {
  return actor?.role === "admin";
}

export function canViewUserList(actor: Actor): PermissionResult {
  return isAdmin(actor) ? { allowed: true } : { allowed: false, reason: "NOT_ADMIN" };
}

/**
 * Admins dürfen für andere Nutzer ein neues Passwort setzen (z. B. wenn es vergessen wurde).
 * Für das eigene Konto nutzt jeder den normalen Weg mit Eingabe des aktuellen Passworts.
 */
export function canSetPasswordFor(actor: Actor, targetUserId: string): PermissionResult {
  if (!isAdmin(actor)) return { allowed: false, reason: "NOT_ADMIN" };
  if (actor.id === targetUserId) return { allowed: false, reason: "SELF_NOT_ALLOWED" };
  return { allowed: true };
}

/** Allgemeine Besitz-Regel: Nutzer greifen nur auf ihre eigenen Datensätze zu. */
export function canAccessOwnedRecord(actor: Actor, ownerId: string): boolean {
  return actor.id === ownerId;
}
