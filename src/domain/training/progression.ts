/**
 * Progression pro Satz (Double Progression mit RIR-Feinsteuerung) und Deload-Wochen.
 * Reine Funktionen: Eingabe ist die letzte Leistung, Ausgabe sind Zielwerte für jeden Satz.
 */
import type { Equipment, Exercise, ExerciseType } from "@/domain/exercises/types";

export interface PerformedSet {
  weightKg: number | null;
  /** Wiederholungen; bei Zeitübungen Sekunden. */
  reps: number | null;
  rir: number | null;
}

export interface SetTarget {
  weightKg: number | null;
  reps: number | null;
}

export interface Prescription {
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
}

export const DELOAD_WEIGHT_FACTOR = 0.9;
const DURATION_STEP_SECONDS = 5;
/** Ab so vielen Wiederholungen „Luft“ über dem Ziel-RIR gilt ein Satz als zu leicht. */
const EASY_RIR_MARGIN = 2;

const INCREMENT_BY_EQUIPMENT: Partial<Record<Equipment, number>> = {
  barbell: 2.5,
  ez_bar: 2.5,
  smith_machine: 2.5,
  dumbbell: 2,
  kettlebell: 4,
  machine: 5,
  cable: 2.5,
};
const DEFAULT_INCREMENT_KG = 2.5;

/** Üblicher Gewichtssprung für eine Übung in kg. Eigene Stufen je Trainingsort: siehe weights.ts. */
export function defaultIncrementKg(exercise: Pick<Exercise, "equipment">): number {
  for (const item of exercise.equipment) {
    const increment = INCREMENT_BY_EQUIPMENT[item];
    if (increment !== undefined) return increment;
  }
  return DEFAULT_INCREMENT_KG;
}

function roundToIncrement(weightKg: number, incrementKg: number): number {
  return Math.round(weightKg / incrementKg) * incrementKg;
}

/** Sätze in der Deload-Woche: etwa zwei Drittel, mindestens einer. */
export function deloadSetCount(sets: number): number {
  return Math.max(1, Math.ceil((sets * 2) / 3));
}

/**
 * Deload-Woche ist die letzte Woche jedes Blocks von `deloadEveryWeeks` Wochen,
 * gezählt ab dem Starttag des Plans.
 */
export function isDeloadWeek(daysSincePlanStart: number, deloadEveryWeeks: number): boolean {
  if (deloadEveryWeeks <= 1 || daysSincePlanStart < 0) return false;
  const weekIndex = Math.floor(daysSincePlanStart / 7);
  return weekIndex % deloadEveryWeeks === deloadEveryWeeks - 1;
}

function usesExternalWeight(type: ExerciseType): boolean {
  return type === "weight_reps" || type === "weighted_bodyweight" || type === "assisted_bodyweight";
}

/** Nächste Stufe nach oben bzw. unten; z. B. aus den eigenen Gewichtsstufen eines Geräts. */
export interface WeightSteps {
  up: (weightKg: number) => number;
  down: (weightKg: number) => number;
  nearest: (weightKg: number) => number;
}

function stepsFromIncrement(incrementKg: number): WeightSteps {
  return {
    up: (weightKg) => weightKg + incrementKg,
    down: (weightKg) => Math.max(weightKg - incrementKg, 0),
    nearest: (weightKg) => roundToIncrement(weightKg, incrementKg),
  };
}

function nextWeightedTarget(
  previous: PerformedSet,
  prescription: Prescription,
  steps: WeightSteps,
  type: ExerciseType,
): SetTarget {
  const { repMin, repMax, targetRir } = prescription;
  const reps = previous.reps ?? repMin;
  const weight = previous.weightKg ?? 0;
  // Bei unterstützten Übungen bedeutet weniger Gewicht mehr Leistung.
  const assisted = type === "assisted_bodyweight";
  const harder = assisted ? steps.down : steps.up;
  const easier = assisted ? steps.up : steps.down;

  if (reps >= repMax) {
    return { weightKg: Math.max(harder(weight), 0), reps: repMin };
  }
  if (reps <= repMin - 2) {
    return { weightKg: Math.max(easier(weight), 0), reps: repMin };
  }
  if (reps < repMin) return { weightKg: weight, reps: repMin };

  const tooEasy = previous.rir !== null && previous.rir >= targetRir + EASY_RIR_MARGIN;
  const tooHard = previous.rir !== null && previous.rir < targetRir - 1;
  const step = tooEasy ? 2 : tooHard ? 0 : 1;
  return { weightKg: weight, reps: Math.min(reps + step, repMax) };
}

function nextUnweightedTarget(
  previous: PerformedSet,
  prescription: Prescription,
  type: ExerciseType,
): SetTarget {
  const base = previous.reps ?? prescription.repMin;
  const tooHard = previous.rir !== null && previous.rir < prescription.targetRir - 1;
  const step = type === "duration" ? DURATION_STEP_SECONDS : 1;
  return { weightKg: null, reps: tooHard ? base : base + step };
}

function deloadTarget(previous: PerformedSet, prescription: Prescription, steps: WeightSteps): SetTarget {
  const reps = Math.max(prescription.repMin, Math.min(previous.reps ?? prescription.repMin, prescription.repMax) - 2);
  if (previous.weightKg === null) return { weightKg: null, reps };
  return { weightKg: steps.nearest(previous.weightKg * DELOAD_WEIGHT_FACTOR), reps };
}

/** Gewicht halten statt steigern: gleiche Werte wie zuletzt, innerhalb des Zielbereichs. */
function holdTarget(previous: PerformedSet, prescription: Prescription): SetTarget {
  const reps = previous.reps === null ? null : Math.max(previous.reps, prescription.repMin);
  return { weightKg: previous.weightKg, reps };
}

export interface NextTargetsInput {
  exerciseType: ExerciseType;
  prescription: Prescription;
  /** Arbeitssätze der letzten regulären Einheit (ohne Aufwärmsätze, ohne Deload-Woche). */
  previous: PerformedSet[];
  incrementKg: number;
  isDeload: boolean;
  /** Eigene Gewichtsstufen; ohne Angabe gelten Vielfache von `incrementKg`. */
  steps?: WeightSteps;
  /** Nicht steigern (z. B. zyklusangepasst): Vorwerte halten. */
  hold?: boolean;
  /** Wiedereinstieg nach einer Pause: Zielgewichte mit diesem Faktor (< 1) verringern. */
  weightFactor?: number;
}

/** Zielgewicht und Ziel-Wiederholungen für jeden Satz der nächsten Einheit. */
export function nextSetTargets(input: NextTargetsInput): SetTarget[] {
  const { prescription, previous, incrementKg, isDeload, exerciseType } = input;
  const steps = input.steps ?? stepsFromIncrement(incrementKg);
  const factor = input.weightFactor ?? 1;
  const setCount = isDeload ? deloadSetCount(prescription.sets) : prescription.sets;
  const done = previous.filter((set) => set.reps !== null);

  return Array.from({ length: setCount }, (_, index): SetTarget => {
    // Gibt es weniger Vorwerte als Sätze, gilt der letzte bekannte Satz als Maßstab.
    const reference = done[Math.min(index, done.length - 1)];
    if (!reference) return { weightKg: null, reps: null };
    if (isDeload) return deloadTarget(reference, prescription, steps);
    if (factor < 1) {
      // Wiedereinstieg: leichter beginnen und mit den unteren Wiederholungen des Bereichs starten.
      const eased = holdTarget(reference, prescription);
      const lighter = eased.weightKg === null ? null : steps.nearest(eased.weightKg * factor);
      const assisted = exerciseType === "assisted_bodyweight";
      return { weightKg: assisted ? eased.weightKg : lighter, reps: eased.weightKg === null ? eased.reps : prescription.repMin };
    }
    if (input.hold) return holdTarget(reference, prescription);
    return usesExternalWeight(exerciseType)
      ? nextWeightedTarget(reference, prescription, steps, exerciseType)
      : nextUnweightedTarget(reference, prescription, exerciseType);
  });
}

export interface WarmupSet {
  weightKg: number;
  reps: number;
}

const WARMUP_STEPS = [
  { factor: 0.4, reps: 8 },
  { factor: 0.6, reps: 5 },
  { factor: 0.8, reps: 3 },
];

/**
 * Aufwärm-Rechner: steigende Sätze bis zum Arbeitsgewicht. Stufen unterhalb des
 * Mindestgewichts (z. B. leere Stange) oder doppelte Gewichte entfallen.
 */
export function warmupSets(workWeightKg: number, incrementKg: number, minWeightKg = 0): WarmupSet[] {
  const result: WarmupSet[] = [];
  for (const step of WARMUP_STEPS) {
    const weightKg = Math.max(roundToIncrement(workWeightKg * step.factor, incrementKg), minWeightKg);
    const isDuplicate = result.some((set) => set.weightKg === weightKg);
    if (weightKg <= 0 || weightKg >= workWeightKg || isDuplicate) continue;
    result.push({ weightKg, reps: step.reps });
  }
  return result;
}
