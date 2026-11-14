/**
 * Persönliche Rekorde, geschätztes 1RM und Kennzahlen einer Einheit.
 *
 * Unterstützte Übungen (`assisted_bodyweight`, z. B. Klimmzug-Maschine): Das eingetragene Gewicht
 * ist die Unterstützung, weniger ist also besser. Entscheidung:
 * - Gewichts-Rekord ist die geringste Unterstützung in einem gewerteten Satz (Rekordtyp „assistance“).
 * - Ohne Körpergewicht lässt sich keine echte Last berechnen: kein 1RM, kein Satz-Volumen und kein
 *   Volumen in den Summen (Unterstützung × Wiederholungen wäre umso größer, je leichter es war).
 * - Wiederholungsrekorde nur, solange nie mit Unterstützung trainiert wurde – sonst wären Sätze mit
 *   mehr Unterstützung und mehr Wiederholungen „Rekorde“.
 */
import type { ExerciseType } from "@/domain/exercises/types";
import type { SetType } from "./types";

export interface LoggedSet {
  type: SetType;
  weightKg: number | null;
  reps: number | null;
  completed: boolean;
  /** Gewicht ist Unterstützung (unterstützte Übung): zählt nicht zum Volumen. */
  assisted?: boolean;
}

/** Über dieser Wiederholungszahl ist die 1RM-Schätzung zu ungenau, um als Rekord zu zählen. */
export const MAX_REPS_FOR_ONE_REP_MAX = 12;

/** Bei dieser Übungsart bedeutet weniger eingetragenes Gewicht mehr Leistung. */
export function isAssisted(type: ExerciseType | null | undefined): boolean {
  return type === "assisted_bodyweight";
}

/** Geschätztes 1RM nach Epley. Ein einzelner Satz mit einer Wiederholung ist das Gewicht selbst. */
export function estimateOneRepMax(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

export interface ExerciseBests {
  maxWeightKg: number | null;
  maxOneRepMaxKg: number | null;
  maxReps: number | null;
  maxSetVolumeKg: number | null;
  /** Geringste Unterstützung (nur unterstützte Übungen; 0 = ohne Unterstützung geschafft). */
  minAssistanceKg: number | null;
}

export const RECORD_TYPES = ["weight", "one_rep_max", "reps", "set_volume", "assistance"] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export interface PersonalRecord {
  type: RecordType;
  value: number;
}

/** Aufwärmsätze und nicht abgeschlossene Sätze zählen weder für Volumen noch für Rekorde. */
export function countingSets(sets: readonly LoggedSet[]): LoggedSet[] {
  return sets.filter((set) => set.completed && set.type !== "warmup" && (set.reps ?? 0) > 0);
}

export function bestsOf(sets: readonly LoggedSet[], exerciseType: ExerciseType = "weight_reps"): ExerciseBests {
  const bests: ExerciseBests = {
    maxWeightKg: null,
    maxOneRepMaxKg: null,
    maxReps: null,
    maxSetVolumeKg: null,
    minAssistanceKg: null,
  };
  const raise = (current: number | null, value: number) =>
    current === null || value > current ? value : current;
  const assisted = isAssisted(exerciseType);

  for (const set of countingSets(sets)) {
    const reps = set.reps ?? 0;
    bests.maxReps = raise(bests.maxReps, reps);
    if (assisted) {
      // Null Unterstützung ist eine gültige (die beste) Angabe; fehlt der Wert, gibt es keinen Vergleich.
      if (set.weightKg !== null && set.weightKg >= 0) {
        bests.minAssistanceKg =
          bests.minAssistanceKg === null ? set.weightKg : Math.min(bests.minAssistanceKg, set.weightKg);
      }
      continue;
    }
    const weight = set.weightKg ?? 0;
    if (weight <= 0) continue;
    bests.maxWeightKg = raise(bests.maxWeightKg, weight);
    bests.maxSetVolumeKg = raise(bests.maxSetVolumeKg, weight * reps);
    if (reps <= MAX_REPS_FOR_ONE_REP_MAX) {
      bests.maxOneRepMaxKg = raise(bests.maxOneRepMaxKg, estimateOneRepMax(weight, reps));
    }
  }
  return bests;
}

/**
 * Vergleicht die Sätze einer Einheit mit den bisherigen Bestwerten.
 * Ohne Historie (`previous` ist null) gibt es keine Rekorde: Das erste Training setzt nur die Basis.
 */
export function detectRecords(
  sets: readonly LoggedSet[],
  previous: ExerciseBests | null,
  exerciseType: ExerciseType = "weight_reps",
): PersonalRecord[] {
  if (!previous) return [];
  const current = bestsOf(sets, exerciseType);
  const records: PersonalRecord[] = [];
  const check = (type: RecordType, now: number | null, before: number | null) => {
    if (now !== null && before !== null && now > before) records.push({ type, value: now });
  };
  check("weight", current.maxWeightKg, previous.maxWeightKg);
  check("one_rep_max", current.maxOneRepMaxKg, previous.maxOneRepMaxKg);
  check("set_volume", current.maxSetVolumeKg, previous.maxSetVolumeKg);
  const nowAssistance = current.minAssistanceKg;
  const beforeAssistance = previous.minAssistanceKg ?? null;
  if (nowAssistance !== null && beforeAssistance !== null && nowAssistance < beforeAssistance) {
    records.push({ type: "assistance", value: nowAssistance });
  }
  // Wiederholungsrekorde zählen nur bei Übungen ohne Gewicht, sonst wären leichte Sätze „Rekorde“.
  if (previous.maxWeightKg === null && beforeAssistance === null && nowAssistance === null) {
    check("reps", current.maxReps, previous.maxReps);
  }
  return records;
}

export interface SessionTotals {
  completedSets: number;
  volumeKg: number;
}

/** Summen einer Einheit. Unterstützung (`assisted`) ist keine bewegte Last und zählt nicht zum Volumen. */
export function sessionTotals(sets: readonly LoggedSet[]): SessionTotals {
  const counted = countingSets(sets);
  return {
    completedSets: counted.length,
    volumeKg: counted.reduce(
      (total, set) => (set.assisted ? total : total + (set.weightKg ?? 0) * (set.reps ?? 0)),
      0,
    ),
  };
}
