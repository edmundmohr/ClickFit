/**
 * Tagesvorlagen des Plan-Generators. Ein Tag besteht aus Slots in Prioritätsreihenfolge:
 * Die ersten Slots sind die wichtigsten, bei kurzer Einheitendauer fallen die letzten weg.
 */
import type { MovementPattern, Muscle } from "@/domain/exercises/types";
import type { DayFocus, Split } from "../types";

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

/** Welcher Split zu wie vielen Trainingstagen passt und in welcher Reihenfolge die Tage laufen. */
export const SPLIT_BY_DAYS: Record<number, { split: Split; days: DayFocus[] }> = {
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
