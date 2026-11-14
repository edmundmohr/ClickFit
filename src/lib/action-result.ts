import { AppError, toErrorCode, type ErrorCode } from "@/lib/errors";

/** Einheitliches Ergebnis von Server Actions, die direkt aus Komponenten aufgerufen werden. */
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: ErrorCode };

export const ok = <T>(data: T): ActionResult<T> => ({ ok: true, data });
export const done: ActionResult = { ok: true, data: undefined };
export function fail(error: unknown): ActionResult<never> {
  // Erwartete Fehler (AppError) sind Teil des Ablaufs; alles andere gehört ins Server-Log.
  if (!(error instanceof AppError)) console.error("Unexpected error in server action:", error);
  return { ok: false, error: toErrorCode(error) };
}
export const invalid: ActionResult<never> = { ok: false, error: "VALIDATION" };

/** Führt eine Aufgabe aus und wandelt Fehler in ein Ergebnis mit Fehlercode um. */
export async function attempt<T>(task: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return ok(await task());
  } catch (error) {
    return fail(error);
  }
}
