/**
 * Reine Rechte-Regeln für die Nutzerverwaltung durch den Admin.
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

export type PermissionDenial = "NOT_ADMIN" | "SELF_NOT_ALLOWED" | "OWN_ACCOUNT_PROTECTED";

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

/** Nur Admins legen Konten an oder ändern Name, Benutzername und Rolle. */
export function canManageUsers(actor: Actor): PermissionResult {
  return isAdmin(actor) ? { allowed: true } : { allowed: false, reason: "NOT_ADMIN" };
}

/**
 * Die eigene Rolle lässt sich nicht ändern. Zusammen mit `canDeleteUser` bleibt so immer
 * mindestens ein Admin übrig: Wer ändert oder löscht, ist selbst Admin und bleibt es.
 */
export function canChangeRoleOf(actor: Actor, targetUserId: string): PermissionResult {
  if (!isAdmin(actor)) return { allowed: false, reason: "NOT_ADMIN" };
  if (actor.id === targetUserId) return { allowed: false, reason: "OWN_ACCOUNT_PROTECTED" };
  return { allowed: true };
}

/** Admins löschen andere Konten, nie das eigene. */
export function canDeleteUser(actor: Actor, targetUserId: string): PermissionResult {
  if (!isAdmin(actor)) return { allowed: false, reason: "NOT_ADMIN" };
  if (actor.id === targetUserId) return { allowed: false, reason: "OWN_ACCOUNT_PROTECTED" };
  return { allowed: true };
}

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const DISPLAY_NAME_MAX_LENGTH = 60;
/** Als HTML-`pattern` nutzbar; entspricht der Prüfung von Better Auth bei der Anmeldung. */
export const USERNAME_PATTERN = "[a-zA-Z0-9_.]+";

/**
 * Benutzernamen bestehen aus Buchstaben (ohne Umlaute), Ziffern, Punkt und Unterstrich.
 * Die Anmeldung lehnt alles andere ab; ein solches Konto ließe sich also nie benutzen.
 */
export function isValidUsername(value: string): boolean {
  return (
    value.length >= USERNAME_MIN_LENGTH &&
    value.length <= USERNAME_MAX_LENGTH &&
    new RegExp(`^${USERNAME_PATTERN}$`).test(value)
  );
}

/** Allgemeine Besitz-Regel: Nutzer greifen nur auf ihre eigenen Datensätze zu. */
export function canAccessOwnedRecord(actor: Actor, ownerId: string): boolean {
  return actor.id === ownerId;
}
