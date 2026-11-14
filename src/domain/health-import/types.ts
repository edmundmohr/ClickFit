/**
 * Health-Import: einheitliches Zielmodell, in das alle Eingabeformate (einfaches JSON,
 * „Health Auto Export“, CSV) übersetzt werden. Reine Typen und Grenzen ohne Framework.
 */
import type { ActivityType } from "@/domain/cardio/types";
import type { LocalDate } from "@/lib/dates";

export interface ImportedWeight {
  date: LocalDate;
  kg: number;
}

export interface ImportedSteps {
  date: LocalDate;
  count: number;
}

export interface ImportedRestingHeartRate {
  date: LocalDate;
  bpm: number;
}

export interface ImportedWorkout {
  /** Kennung der Quelle oder stabil aus Art und Startzeit abgeleitet. */
  externalId: string;
  type: ActivityType;
  start: Date;
  durationSeconds: number;
  distanceMeters: number | null;
  avgHeartRate: number | null;
}

export interface HealthImport {
  /** Ein Wert pro Tag: der letzte des Tages. */
  weights: ImportedWeight[];
  /** Ein Wert pro Tag: die Summe aller Einträge des Tages. */
  steps: ImportedSteps[];
  /** Ein Wert pro Tag: der letzte des Tages. */
  restingHeartRates: ImportedRestingHeartRate[];
  workouts: ImportedWorkout[];
  /** Einträge, die nicht übernommen wurden (unvollständig, unplausibel, Krafttraining). */
  skipped: number;
}

export const HEALTH_METRIC_TYPES = ["steps", "resting_heart_rate"] as const;
export type HealthMetricType = (typeof HEALTH_METRIC_TYPES)[number];

export const CSV_KINDS = ["weight", "steps", "resting_heart_rate", "activities"] as const;
export type CsvKind = (typeof CSV_KINDS)[number];

export function isCsvKind(value: unknown): value is CsvKind {
  return typeof value === "string" && (CSV_KINDS as readonly string[]).includes(value);
}

/** Plausibilitätsgrenzen; Werte außerhalb werden übersprungen. */
export const LIMITS = {
  weightKg: [20, 400],
  steps: [0, 200_000],
  restingHeartRate: [25, 200],
  durationSeconds: [60, 86_400],
  avgHeartRate: [30, 250],
  maxDistanceMeters: 1_000_000,
  /** Höchstens so viele Einträge je Art pro Anfrage bzw. Datei. */
  maxEntriesPerKind: 5_000,
  /** So weit darf ein Zeitpunkt in der Zukunft liegen (Zeitzonen, falsch gehende Uhren). */
  futureToleranceMs: 24 * 60 * 60 * 1000,
  maxAgeYears: 10,
  maxExternalIdLength: 128,
} as const;

/** Warum ein einzelner Eintrag nicht übernommen wurde. */
export type EntryIssue = "date" | "value" | "range" | "type" | "strength";

export type HealthImportErrorReason = "format" | "too_many_entries";

/** Die Eingabe als Ganzes ist unbrauchbar (kein bekanntes Format oder zu viele Einträge). */
export class HealthImportError extends Error {
  readonly reason: HealthImportErrorReason;

  constructor(reason: HealthImportErrorReason) {
    super(reason);
    this.name = "HealthImportError";
    this.reason = reason;
  }
}

export function emptyHealthImport(): HealthImport {
  return { weights: [], steps: [], restingHeartRates: [], workouts: [], skipped: 0 };
}
