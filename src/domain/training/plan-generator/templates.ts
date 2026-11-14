/**
 * Tagesvorlagen des Plan-Generators. Ein Tag besteht aus Slots in Prioritätsreihenfolge:
 * Die ersten Slots sind die wichtigsten, bei kurzer Einheitendauer fallen die letzten weg.
 */
import type { Equipment, MovementPattern, Muscle } from "@/domain/exercises/types";
import type { DayFocus, Split, TrainingProfile } from "../types";

export interface Slot {
  /** Akzeptierte Bewegungsmuster, das erste ist die bevorzugte Wahl. */
  patterns: MovementPattern[];
  /** Optional: Die Übung muss einen dieser Muskeln primär trainieren. */
  muscles?: Muscle[];
  kind: "compound" | "accessory";
}

const compound = (patterns: MovementPattern[], muscles?: Muscle[]): Slot => ({
  patterns,
  muscles,
  kind: "compound",
});
const accessory = (patterns: MovementPattern[], muscles?: Muscle[]): Slot => ({
  patterns,
  muscles,
  kind: "accessory",
});

const SQUAT = compound(["squat", "lunge"]);
const HINGE = compound(["hinge", "hip_thrust", "back_extension"]);
const LUNGE = compound(["lunge", "squat"]);
const HIP_THRUST = compound(["hip_thrust", "hinge"]);
const PUSH_H = compound(["horizontal_push"]);
const PUSH_V = compound(["vertical_push", "horizontal_push"]);
const PULL_H = compound(["horizontal_pull"]);
const PULL_V = compound(["vertical_pull", "horizontal_pull"]);
const CORE_STABILITY = accessory(["core_stability", "core_flexion"]);
const CORE_FLEXION = accessory(["core_flexion", "core_rotation", "core_stability"]);
const CORE_ROTATION = accessory(["core_rotation", "core_flexion", "core_stability"]);
const SIDE_DELTS = accessory(["shoulder_raise"], ["side_delts"]);
const REAR_DELTS = accessory(["rear_delt"]);
const BICEPS = accessory(["elbow_flexion"], ["biceps"]);
const TRICEPS = accessory(["elbow_extension"]);
const CHEST_FLY = accessory(["chest_fly"]);
const LEG_CURL = accessory(["knee_flexion"]);
const LEG_EXTENSION = accessory(["knee_extension"]);
const CALVES = accessory(["calf_raise"]);
const ABDUCTORS = accessory(["hip_abduction"]);
const ADDUCTORS = accessory(["hip_adduction"]);
const TRAPS = accessory(["shrug"]);

/** Griffkraft-Modul: Griffübung, ersatzweise Tragen oder Unterarm-Curls. */
export const GRIP_SLOT: Slot = accessory(["grip", "carry", "elbow_flexion"], ["forearms"]);
export const GRIP_DAYS_PER_WEEK = 2;
/** Reihenfolge, in der Tage für die Griffarbeit gewählt werden (Zug-Tage zuerst). */
export const GRIP_DAY_ORDER: DayFocus[] = [
  "pull_a",
  "pull_b",
  "upper_a",
  "upper_b",
  "full_body_a",
  "full_body_c",
  "full_body_b",
  "lower_b",
  "legs_b",
  "lower_a",
  "legs_a",
  "push_a",
  "push_b",
];

/** Alle Slot-Arten, aus denen der erholungsorientierte Modus den Tag zusammenstellt. */
export const RECOVERY_SLOTS: Slot[] = [
  SQUAT,
  PUSH_H,
  PULL_V,
  HINGE,
  PULL_H,
  PUSH_V,
  LUNGE,
  HIP_THRUST,
  CORE_STABILITY,
  SIDE_DELTS,
  BICEPS,
  TRICEPS,
  LEG_CURL,
  REAR_DELTS,
  CALVES,
  CHEST_FLY,
  CORE_FLEXION,
  LEG_EXTENSION,
];

export const DAY_TEMPLATES: Record<DayFocus, Slot[]> = {
  full_body_a: [SQUAT, PUSH_H, PULL_H, HINGE, PUSH_V, CORE_STABILITY, BICEPS, CALVES],
  full_body_b: [HINGE, PUSH_V, PULL_V, LUNGE, PUSH_H, CORE_FLEXION, TRICEPS, SIDE_DELTS],
  full_body_c: [LUNGE, PUSH_H, PULL_V, HIP_THRUST, PULL_H, SIDE_DELTS, CORE_ROTATION, LEG_CURL],
  upper_a: [PUSH_H, PULL_H, PUSH_V, PULL_V, SIDE_DELTS, TRICEPS, BICEPS, REAR_DELTS],
  upper_b: [PULL_V, PUSH_V, PULL_H, PUSH_H, REAR_DELTS, BICEPS, TRICEPS, CHEST_FLY],
  lower_a: [SQUAT, HINGE, LUNGE, LEG_CURL, CALVES, CORE_STABILITY, LEG_EXTENSION, ABDUCTORS],
  lower_b: [HINGE, SQUAT, HIP_THRUST, LEG_EXTENSION, CALVES, CORE_FLEXION, LEG_CURL, ADDUCTORS],
  push_a: [PUSH_H, PUSH_V, CHEST_FLY, SIDE_DELTS, TRICEPS, PUSH_H, TRICEPS, CORE_STABILITY],
  push_b: [PUSH_V, PUSH_H, SIDE_DELTS, CHEST_FLY, TRICEPS, PUSH_H, SIDE_DELTS, CORE_FLEXION],
  pull_a: [PULL_V, PULL_H, REAR_DELTS, BICEPS, PULL_H, TRAPS, BICEPS, CORE_ROTATION],
  pull_b: [PULL_H, PULL_V, BICEPS, REAR_DELTS, PULL_V, TRAPS, BICEPS, CORE_STABILITY],
  legs_a: [SQUAT, HINGE, LUNGE, LEG_CURL, CALVES, LEG_EXTENSION, CORE_FLEXION, ABDUCTORS],
  legs_b: [HINGE, SQUAT, HIP_THRUST, LEG_EXTENSION, CALVES, LEG_CURL, CORE_STABILITY, ADDUCTORS],
};

export interface SplitChoice {
  split: Split;
  days: DayFocus[];
}

/**
 * Standard-Split je Zahl der Trainingstage, wenn Erfahrung, Dauer und Equipment nichts dagegen
 * sprechen (Fortgeschrittene und Profis, ab 45 Minuten, mit Zusatzgewichten).
 */
export const SPLIT_BY_DAYS: Record<number, SplitChoice> = {
  1: { split: "full_body", days: ["full_body_a"] },
  2: { split: "full_body", days: ["full_body_a", "full_body_b"] },
  3: { split: "full_body", days: ["full_body_a", "full_body_b", "full_body_c"] },
  4: { split: "upper_lower", days: ["upper_a", "lower_a", "upper_b", "lower_b"] },
  5: { split: "upper_lower_ppl", days: ["upper_a", "lower_a", "push_a", "pull_a", "legs_b"] },
  6: {
    split: "push_pull_legs",
    days: ["push_a", "pull_a", "legs_a", "push_b", "pull_b", "legs_b"],
  },
};

/**
 * Ober-/Unterkörper im Wechsel für fünf oder sechs Tage. Jede Muskelgruppe kommt zwei- bis
 * dreimal pro Woche dran, und auch kurze Einheiten decken den halben Körper ab.
 */
const UPPER_LOWER_BY_DAYS: Record<number, SplitChoice> = {
  5: { split: "upper_lower", days: ["upper_a", "lower_a", "upper_b", "lower_b", "upper_a"] },
  6: { split: "upper_lower", days: ["upper_a", "lower_a", "upper_b", "lower_b", "upper_a", "lower_a"] },
};

/** Ab dieser Einheitendauer lohnt sich ein feinerer Split mit Push/Pull/Beine. */
export const PPL_MIN_SESSION_MINUTES = 45;

/** Geräte mit Zusatzgewicht. Ohne sie gibt es zu wenige Varianten für eigene Push-, Pull- und Beintage. */
const LOADED_EQUIPMENT: readonly Equipment[] = [
  "barbell",
  "ez_bar",
  "dumbbell",
  "kettlebell",
  "cable",
  "machine",
  "smith_machine",
];

/**
 * Wählt den Split passend zu Tagen, Erfahrung, Dauer und Equipment (der Ort steckt im Equipment).
 * Bis vier Tage gilt immer die Standardtabelle (Ganzkörper bzw. Ober-/Unterkörper). Push/Pull/Beine
 * gibt es nur für Fortgeschrittene und Profis mit mindestens 45 Minuten und Zusatzgewichten;
 * sonst wird bei fünf oder sechs Tagen Ober-/Unterkörper im Wechsel geplant. Anfänger und kurze
 * Einheiten bekommen so keine Tage mit nur drei Übungen für eine einzelne Bewegungsrichtung.
 */
export function chooseSplit(
  dayCount: number,
  profile: Pick<TrainingProfile, "experience" | "sessionMinutes" | "equipment">,
): SplitChoice {
  const standard = SPLIT_BY_DAYS[dayCount];
  const upperLower = UPPER_LOWER_BY_DAYS[dayCount];
  if (!upperLower) return standard;
  const pplFits =
    profile.experience !== "beginner" &&
    profile.sessionMinutes >= PPL_MIN_SESSION_MINUTES &&
    profile.equipment.some((item) => LOADED_EQUIPMENT.includes(item));
  return pplFits ? standard : upperLower;
}
