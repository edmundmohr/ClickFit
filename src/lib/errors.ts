/**
 * Fehlercodes, die Dienste und Server Actions zurückgeben.
 * Zu jedem Code gibt es eine Übersetzung unter `errors.<code>` in den Textdateien
 * (der Typ des Textkatalogs erzwingt das).
 */
export const ERROR_CODES = [
  "UNKNOWN",
  "VALIDATION",
  "INVALID_CREDENTIALS",
  "TOO_MANY_REQUESTS",
  "USERNAME_TAKEN",
  "PASSWORD_TOO_SHORT",
  "PASSWORD_MISMATCH",
  "WRONG_PASSWORD",
  "NOT_FOUND",
  "NOT_ADMIN",
  "SELF_NOT_ALLOWED",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export class AppError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode) {
    super(code);
    this.name = "AppError";
    this.code = code;
  }
}

export function toErrorCode(error: unknown): ErrorCode {
  return error instanceof AppError ? error.code : "UNKNOWN";
}

export type ActionState = { status: "idle" } | { status: "success" } | { status: "error"; error: ErrorCode };

export const IDLE_STATE: ActionState = { status: "idle" };
