/**
 * Austauschbare Schnittstelle zum KI-Anbieter. Die App kennt nur diese Schnittstelle; welcher
 * Anbieter dahintersteht, entscheidet `getLlmProvider`. Ohne Anbieter läuft die App vollständig.
 */
import type { z } from "zod";

export const LLM_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type LlmImageType = (typeof LLM_IMAGE_TYPES)[number];

export interface LlmImage {
  mediaType: LlmImageType;
  base64: string;
}

/** Wie gründlich das Modell arbeiten soll (wirkt auf Qualität, Dauer und Kosten). */
export type LlmEffort = "low" | "medium" | "high";

export interface LlmRequest<Schema extends z.ZodType> {
  /** Rolle und feste Regeln für das Modell. */
  system: string;
  /** Die eigentliche Aufgabe samt Daten. */
  prompt: string;
  images?: LlmImage[];
  /** Form der Antwort. Der Anbieter liefert genau diese Struktur oder gar nichts. */
  schema: Schema;
  effort: LlmEffort;
}

export type LlmResult<T> =
  | { status: "ok"; data: T; model: string }
  /** Das Modell hat die Anfrage aus Sicherheitsgründen abgelehnt. */
  | { status: "refused" }
  /** Technischer Fehler (Netz, Überlastung, ungültige Antwort). */
  | { status: "failed" }
  /** Der Schlüssel fehlt oder wird vom Anbieter nicht akzeptiert. */
  | { status: "unavailable" };

export interface LlmProvider {
  /** Name des Anbieters für Anzeige und Protokoll. */
  readonly name: string;
  readonly model: string;
  generate: <Schema extends z.ZodType>(request: LlmRequest<Schema>) => Promise<LlmResult<z.infer<Schema>>>;
}
