/**
 * Vorgaben für Sätze, Wiederholungen, Pausen und Zeitbedarf – abhängig von Ziel und Erfahrung.
 */
import type { Exercise } from "@/domain/exercises/types";
import type { ExperienceLevel, Goal, PlannedExercise } from "../types";

/** Sekunden für Aufwärmen und Wege, die von der Einheitendauer abgehen. */
export const WARMUP_SECONDS = 5 * 60;
/** Geschätzte Dauer eines Satzes (Ausführung) in Sekunden. */
export const SET_WORK_SECONDS = 40;
/** Zeit für Aufbau/Wechsel zwischen zwei Übungen in Sekunden. */
export const EXERCISE_SETUP_SECONDS = 60;

interface RepRange {
  repMin: number;
  repMax: number;
}

const REP_RANGES: Record<Goal, { compound: RepRange; accessory: RepRange }> = {
  muscle_gain: { compound: { repMin: 6, repMax: 10 }, accessory: { repMin: 10, repMax: 15 } },
  recomposition: { compound: { repMin: 6, repMax: 10 }, accessory: { repMin: 10, repMax: 15 } },
  fat_loss: { compound: { repMin: 8, repMax: 12 }, accessory: { repMin: 12, repMax: 15 } },
  maintain: { compound: { repMin: 8, repMax: 12 }, accessory: { repMin: 10, repMax: 15 } },
};

const SETS: Record<ExperienceLevel, { compound: number; accessory: number }> = {
  beginner: { compound: 3, accessory: 2 },
  intermediate: { compound: 3, accessory: 3 },
  advanced: { compound: 4, accessory: 3 },
};

const TARGET_RIR: Record<ExperienceLevel, { compound: number; accessory: number }> = {
  beginner: { compound: 3, accessory: 2 },
  intermediate: { compound: 2, accessory: 1 },
  advanced: { compound: 1, accessory: 1 },
};

const REST_SECONDS = { compound: 150, accessory: 75, fatLossCompound: 120, fatLossAccessory: 60 };

/**
 * Übungen ohne Gewicht lassen sich nur über Wiederholungen steigern: deshalb höhere
 * Wiederholungsbereiche und kürzere Pausen.
 */
const BODYWEIGHT_RANGE: Record<"compound" | "accessory", RepRange> = {
  compound: { repMin: 8, repMax: 20 },
  accessory: { repMin: 12, repMax: 20 },
};
const BODYWEIGHT_REST_SECONDS = { compound: 90, accessory: 60 };

/** Zeitübungen (z. B. Plank) werden in Sekunden statt Wiederholungen geplant. */
const DURATION_RANGE: Record<ExperienceLevel, RepRange> = {
  beginner: { repMin: 20, repMax: 40 },
  intermediate: { repMin: 30, repMax: 60 },
  advanced: { repMin: 45, repMax: 90 },
};

/** Wie viele Wochen bis zur nächsten Deload-Woche (die letzte Woche des Blocks ist die Deload-Woche). */
export const DELOAD_EVERY_WEEKS: Record<ExperienceLevel, number> = {
  beginner: 8,
  intermediate: 6,
  advanced: 5,
};

export function prescribe(
  exercise: Exercise,
  kind: "compound" | "accessory",
  goal: Goal,
  experience: ExperienceLevel,
): PlannedExercise {
  const isFatLoss = goal === "fat_loss";
  const isBodyweight = exercise.type === "bodyweight_reps";
  const loadedRest =
    kind === "compound"
      ? isFatLoss
        ? REST_SECONDS.fatLossCompound
        : REST_SECONDS.compound
      : isFatLoss
        ? REST_SECONDS.fatLossAccessory
        : REST_SECONDS.accessory;
  const restSeconds =
    isBodyweight || exercise.type === "duration" ? BODYWEIGHT_REST_SECONDS[kind] : loadedRest;
  const range =
    exercise.type === "duration"
      ? DURATION_RANGE[experience]
      : isBodyweight
        ? BODYWEIGHT_RANGE[kind]
        : REP_RANGES[goal][kind];
  return {
    exerciseId: exercise.id,
    sets: SETS[experience][kind],
    repMin: range.repMin,
    repMax: range.repMax,
    targetRir: TARGET_RIR[experience][kind],
    restSeconds,
  };
}

/** Geschätzte Dauer einer geplanten Übung in Sekunden (Sätze, Pausen, Aufbau). */
export function estimateExerciseSeconds(planned: Pick<PlannedExercise, "sets" | "restSeconds">): number {
  const pauses = Math.max(planned.sets - 1, 0) * planned.restSeconds;
  return EXERCISE_SETUP_SECONDS + planned.sets * SET_WORK_SECONDS + pauses;
}

export function estimateSessionSeconds(
  exercises: Pick<PlannedExercise, "sets" | "restSeconds">[],
): number {
  return exercises.reduce((total, planned) => total + estimateExerciseSeconds(planned), WARMUP_SECONDS);
}

/** So wenige Übungen sollte ein Trainingstag mindestens haben. */
export const MIN_EXERCISES_PER_DAY = 3;
/** Weniger Sätze pro Übung plant der Generator nicht, auch nicht bei knapper Zeit. */
export const MIN_SETS_PER_EXERCISE = 2;
/** Um höchstens so viele Sätze pro Übung wird gekürzt, damit genug Übungen in die Zeit passen. */
const MAX_SET_REDUCTION = 2;

/** Dieselbe Vorgabe mit `by` Sätzen weniger, aber nicht unter `MIN_SETS_PER_EXERCISE`. */
export function reduceSets<T extends Pick<PlannedExercise, "sets">>(entry: T, by: number): T {
  if (by <= 0) return entry;
  return { ...entry, sets: Math.min(entry.sets, Math.max(MIN_SETS_PER_EXERCISE, entry.sets - by)) };
}

/**
 * Zeitbudget einhalten, ohne den Tag zu dünn zu machen: `fill` stellt den Tag mit
 * `reduceBy` Sätzen weniger pro Übung zusammen und darf das Budget nie überschreiten.
 * Zuerst gelten die vollen Sätze; reicht die Zeit dann nicht für `minCount` Übungen, wird
 * schrittweise gekürzt. Erreicht keine Variante `minCount`, gewinnt die mit den meisten
 * Übungen (bei Gleichstand die mit mehr Sätzen).
 */
export function fillWithinBudget<T>(fill: (reduceBy: number) => T[], minCount = MIN_EXERCISES_PER_DAY): T[] {
  let best: T[] = [];
  for (let reduceBy = 0; reduceBy <= MAX_SET_REDUCTION; reduceBy++) {
    const result = fill(reduceBy);
    if (result.length >= minCount) return result;
    if (result.length > best.length) best = result;
  }
  return best;
}
