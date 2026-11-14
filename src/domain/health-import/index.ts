/**
 * Einstieg für den JSON-Import: erkennt das Format und liefert das einheitliche Zielmodell.
 */
import { isHealthAutoExport, parseHealthAutoExport } from "./health-auto-export";
import { parseSimplePayload } from "./simple";
import type { HealthImport } from "./types";

export type HealthPayloadFormat = "health_auto_export" | "simple";

/** `data.metrics` oder `data.workouts` → „Health Auto Export“, sonst das einfache Format. */
export function detectFormat(json: unknown): HealthPayloadFormat {
  return isHealthAutoExport(json) ? "health_auto_export" : "simple";
}

/** Wirft `HealthImportError`, wenn die Eingabe keinem der beiden Formate entspricht. */
export function parseHealthPayload(json: unknown, now: Date): HealthImport {
  return detectFormat(json) === "health_auto_export" ? parseHealthAutoExport(json, now) : parseSimplePayload(json, now);
}
