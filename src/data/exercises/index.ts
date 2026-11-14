/** Eingebauter Übungskatalog: fasst alle Teillisten zusammen. */
import type { Exercise } from "@/domain/exercises/types";
import { ARMS_BICEPS_FOREARMS_EXERCISES } from "./arms-biceps-forearms";
import { ARMS_TRICEPS_EXERCISES } from "./arms-triceps";
import { BACK_HORIZONTAL_EXERCISES } from "./back-horizontal";
import { BACK_TRAPS_LOWER_EXERCISES } from "./back-traps-lower";
import { BACK_VERTICAL_EXERCISES } from "./back-vertical";
import { CARDIO_CONDITIONING_EXERCISES } from "./cardio-conditioning";
import { CHEST_EXERCISES } from "./chest";
import { CORE_FLEXION_EXERCISES } from "./core-flexion";
import { CORE_STABILITY_ROTATION_EXERCISES } from "./core-stability-rotation";
import { GLUTES_HIPS_EXERCISES } from "./glutes-hips";
import { LEGS_HAMSTRINGS_EXERCISES } from "./legs-hamstrings";
import { LEGS_LUNGES_CALVES_EXERCISES } from "./legs-lunges-calves";
import { LEGS_QUADS_EXERCISES } from "./legs-quads";
import { SHOULDER_EXERCISES } from "./shoulders";

export const EXERCISES: Exercise[] = [
  ...CHEST_EXERCISES,
  ...BACK_VERTICAL_EXERCISES,
  ...BACK_HORIZONTAL_EXERCISES,
  ...BACK_TRAPS_LOWER_EXERCISES,
  ...SHOULDER_EXERCISES,
  ...ARMS_BICEPS_FOREARMS_EXERCISES,
  ...ARMS_TRICEPS_EXERCISES,
  ...LEGS_QUADS_EXERCISES,
  ...LEGS_LUNGES_CALVES_EXERCISES,
  ...LEGS_HAMSTRINGS_EXERCISES,
  ...GLUTES_HIPS_EXERCISES,
  ...CORE_FLEXION_EXERCISES,
  ...CORE_STABILITY_ROTATION_EXERCISES,
  ...CARDIO_CONDITIONING_EXERCISES,
];

export const EXERCISES_BY_ID: ReadonlyMap<string, Exercise> = new Map(
  EXERCISES.map((exercise) => [exercise.id, exercise]),
);
