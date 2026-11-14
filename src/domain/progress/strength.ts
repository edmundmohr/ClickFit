/**
 * Kraftentwicklung: Verlauf pro Übung, Einordnung des Kraftniveaus und Plateau-Erkennung.
 *
 * Unterstützte Übungen (z. B. Klimmzug-Maschine) haben kein 1RM und kein Volumen: Das Gewicht ist
 * die Unterstützung. Ihr Verlauf ist die geringste Unterstützung je Einheit (weniger = besser), bei
 * gleicher Unterstützung entscheiden die Wiederholungen. Daran misst auch die Plateau-Erkennung.
 */
import type { ExerciseType } from "@/domain/exercises/types";
import { estimateOneRepMax, isAssisted, MAX_REPS_FOR_ONE_REP_MAX } from "@/domain/training/records";
import type { Sex } from "@/domain/training/types";
import { diffDays, type LocalDate } from "@/lib/dates";
import { isCountingSet } from "./muscle-load";
import type { TrainedSet } from "./types";

export interface SessionPoint {
  sessionId: string;
  date: LocalDate;
  /** Bestes geschätztes 1RM der Einheit; `null` bei Übungen ohne Gewicht. */
  oneRepMaxKg: number | null;
  volumeKg: number;
  bestWeightKg: number | null;
  bestReps: number;
  sets: number;
  /** Durchschnittliches RIR der Sätze mit Angabe; `null`, wenn keins eingetragen wurde. */
  avgRir: number | null;
  /** Nur unterstützte Übungen: geringste Unterstützung der Einheit (0 = ohne Unterstützung). */
  minAssistanceKg: number | null;
  /** Meiste Wiederholungen bei dieser geringsten Unterstützung. */
  repsAtMinAssistance: number | null;
}

/** Bester Satz einer unterstützten Übung: geringste Unterstützung, bei Gleichstand mehr Wiederholungen. */
function bestAssisted(sets: readonly { weightKg: number | null; reps: number | null }[]) {
  let best: { kg: number; reps: number } | null = null;
  for (const set of sets) {
    if (set.weightKg === null || set.weightKg < 0) continue;
    const candidate = { kg: set.weightKg, reps: set.reps ?? 0 };
    if (!best || candidate.kg < best.kg || (candidate.kg === best.kg && candidate.reps > best.reps)) best = candidate;
  }
  return best;
}

/** Verlauf einer Übung: ein Punkt pro Einheit, älteste zuerst. */
export function exerciseSeries(
  sets: readonly TrainedSet[],
  exerciseId: string,
  exerciseType: ExerciseType = "weight_reps",
): SessionPoint[] {
  const assisted = isAssisted(exerciseType);
  const sessions = new Map<string, TrainedSet[]>();
  for (const set of sets) {
    if (set.exerciseId !== exerciseId || !isCountingSet(set)) continue;
    sessions.set(set.sessionId, [...(sessions.get(set.sessionId) ?? []), set]);
  }
  return [...sessions.entries()]
    .map(([sessionId, own]): SessionPoint => {
      const weighted = assisted ? [] : own.filter((set) => (set.weightKg ?? 0) > 0);
      const assistance = assisted ? bestAssisted(own) : null;
      const estimates = weighted
        .filter((set) => (set.reps ?? 0) <= MAX_REPS_FOR_ONE_REP_MAX)
        .map((set) => estimateOneRepMax(set.weightKg ?? 0, set.reps ?? 0));
      const rirs = own.flatMap((set) => (set.rir === null ? [] : [set.rir]));
      return {
        sessionId,
        date: own[0].date,
        oneRepMaxKg: estimates.length > 0 ? Math.max(...estimates) : null,
        volumeKg: weighted.reduce((total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
        bestWeightKg: weighted.length > 0 ? Math.max(...weighted.map((set) => set.weightKg ?? 0)) : null,
        bestReps: Math.max(...own.map((set) => set.reps ?? 0)),
        sets: own.length,
        avgRir: rirs.length > 0 ? rirs.reduce((total, rir) => total + rir, 0) / rirs.length : null,
        minAssistanceKg: assistance?.kg ?? null,
        repsAtMinAssistance: assistance?.reps ?? null,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.sessionId.localeCompare(b.sessionId));
}

export const STRENGTH_LIFTS = ["squat", "bench", "deadlift"] as const;
export type StrengthLift = (typeof STRENGTH_LIFTS)[number];

/** Übungen aus der Bibliothek, die für die Einordnung zählen. */
export const LIFT_EXERCISE_IDS: Record<StrengthLift, string[]> = {
  squat: ["barbell-back-squat"],
  bench: ["barbell-bench-press"],
  deadlift: ["deadlift"],
};

export const STRENGTH_LEVELS = ["untrained", "novice", "intermediate", "advanced", "elite"] as const;
export type StrengthLevel = (typeof STRENGTH_LEVELS)[number];

/**
 * Untergrenzen (geschätztes 1RM geteilt durch Körpergewicht) für die Stufen ab „novice“.
 * Grobe, verbreitete Richtwerte – keine Wettkampfnormen.
 */
const LEVEL_THRESHOLDS: Record<Sex, Record<StrengthLift, [number, number, number, number]>> = {
  male: {
    squat: [0.75, 1.25, 1.75, 2.25],
    bench: [0.5, 1, 1.5, 1.75],
    deadlift: [1, 1.5, 2, 2.75],
  },
  female: {
    squat: [0.5, 1, 1.5, 1.75],
    bench: [0.25, 0.6, 0.9, 1.25],
    deadlift: [0.5, 1.25, 1.75, 2.25],
  },
};

export interface StrengthRating {
  level: StrengthLevel;
  /** Geschätztes 1RM im Verhältnis zum Körpergewicht. */
  ratio: number;
  /** Verhältnis, ab dem die nächste Stufe beginnt; `null` auf der höchsten Stufe. */
  nextRatio: number | null;
}

export function rateStrength(lift: StrengthLift, oneRepMaxKg: number, bodyWeightKg: number, sex: Sex): StrengthRating {
  const ratio = bodyWeightKg > 0 ? oneRepMaxKg / bodyWeightKg : 0;
  const thresholds = LEVEL_THRESHOLDS[sex][lift];
  const reached = thresholds.filter((threshold) => ratio >= threshold).length;
  return { level: STRENGTH_LEVELS[reached], ratio, nextRatio: thresholds[reached] ?? null };
}

export const PLATEAU_SUGGESTIONS = ["deload", "volume", "variation"] as const;
export type PlateauSuggestion = (typeof PLATEAU_SUGGESTIONS)[number];

export interface Plateau {
  /** Seit so vielen Tagen keine Steigerung. */
  days: number;
  suggestion: PlateauSuggestion;
}

const PLATEAU_WINDOW = 3;
const PLATEAU_MIN_DAYS = 21;
/** Verbesserungen unter einem Prozent gelten als Messrauschen. */
const PLATEAU_TOLERANCE = 1.01;
const HARD_RIR = 1;
const LOW_SETS = 3;

/** Ist der beste Wert von `recent` besser als der von `before`? Je nach Übungsart per 1RM oder Unterstützung. */
function improved(recent: readonly SessionPoint[], before: readonly SessionPoint[], byAssistance: boolean): boolean {
  if (byAssistance) {
    const toSet = (point: SessionPoint) => ({ weightKg: point.minAssistanceKg, reps: point.repsAtMinAssistance });
    const now = bestAssisted(recent.map(toSet));
    const then = bestAssisted(before.map(toSet));
    if (!now || !then) return false;
    return now.kg < then.kg || (now.kg === then.kg && now.reps > then.reps);
  }
  const best = (points: readonly SessionPoint[]) => Math.max(...points.map((point) => point.oneRepMaxKg ?? 0));
  return best(recent) > best(before) * PLATEAU_TOLERANCE;
}

/**
 * Plateau: Die letzten drei Einheiten sind nicht besser als die drei davor, über mindestens
 * drei Wochen. Der Vorschlag richtet sich danach, wie hart und wie viel zuletzt trainiert wurde.
 * Unterstützte Übungen werden an der geringsten Unterstützung gemessen (weniger = besser).
 */
export function detectPlateau(series: readonly SessionPoint[]): Plateau | null {
  const byAssistance = !series.some((point) => point.oneRepMaxKg !== null);
  const measurable = series.filter((point) =>
    byAssistance ? point.minAssistanceKg !== null : point.oneRepMaxKg !== null,
  );
  if (measurable.length < PLATEAU_WINDOW * 2) return null;
  const recent = measurable.slice(-PLATEAU_WINDOW);
  const before = measurable.slice(-PLATEAU_WINDOW * 2, -PLATEAU_WINDOW);
  if (improved(recent, before, byAssistance)) return null;
  const days = diffDays(before[0].date, recent[recent.length - 1].date);
  if (days < PLATEAU_MIN_DAYS) return null;

  const rirs = recent.flatMap((point) => (point.avgRir === null ? [] : [point.avgRir]));
  const avgRir = rirs.length > 0 ? rirs.reduce((total, rir) => total + rir, 0) / rirs.length : null;
  const avgSets = recent.reduce((total, point) => total + point.sets, 0) / recent.length;
  const suggestion: PlateauSuggestion =
    avgRir !== null && avgRir <= HARD_RIR ? "deload" : avgSets < LOW_SETS ? "volume" : "variation";
  return { days, suggestion };
}
