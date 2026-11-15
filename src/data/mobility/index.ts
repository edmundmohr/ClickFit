/** Eingebauter Mobility-Katalog: fasst Übungen und Routinen zusammen. */
import type { MobilityExercise, MobilityRoutine } from "@/domain/mobility/types";
import { HIP_MOBILITY_EXERCISES } from "./exercises-hips";
import { LIMB_FULL_BODY_MOBILITY_EXERCISES } from "./exercises-limbs-full-body";
import { NECK_SHOULDER_MOBILITY_EXERCISES } from "./exercises-neck-shoulders";
import { SPINE_MOBILITY_EXERCISES } from "./exercises-spine";
import { MOBILITY_ROUTINES } from "./routines";
import { WARMUP_EXERCISE_IDS } from "./warmup";

export { MEDICAL_NOTE, MOBILITY_ROUTINES } from "./routines";

export const MOBILITY_EXERCISES: MobilityExercise[] = [
  ...NECK_SHOULDER_MOBILITY_EXERCISES,
  ...SPINE_MOBILITY_EXERCISES,
  ...HIP_MOBILITY_EXERCISES,
  ...LIMB_FULL_BODY_MOBILITY_EXERCISES,
];

export const MOBILITY_EXERCISES_BY_ID: ReadonlyMap<string, MobilityExercise> = new Map(
  MOBILITY_EXERCISES.map((exercise) => [exercise.id, exercise]),
);

export const MOBILITY_ROUTINES_BY_ID: ReadonlyMap<string, MobilityRoutine> = new Map(
  MOBILITY_ROUTINES.map((routine) => [routine.id, routine]),
);

/** Übungen, aus denen das Warm-up vor dem Krafttraining zusammengestellt wird. */
export const WARMUP_EXERCISES: MobilityExercise[] = WARMUP_EXERCISE_IDS.flatMap((id) => {
  const exercise = MOBILITY_EXERCISES_BY_ID.get(id);
  return exercise ? [exercise] : [];
});
