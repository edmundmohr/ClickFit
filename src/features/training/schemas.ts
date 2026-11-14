import { z } from "zod";
import { EQUIPMENT } from "@/domain/exercises/types";
import {
  ACTIVITY_LEVELS,
  BODY_REGIONS,
  CARDIO_TYPES,
  EXPERIENCE_LEVELS,
  GOALS,
  LOCATION_TYPES,
  MAX_TRAINING_DAYS,
  MIN_TRAINING_DAYS,
  SET_TYPES,
  SEXES,
} from "@/domain/training/types";

const weekday = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
]);
const sessionMinutes = z.union([
  z.literal(30),
  z.literal(45),
  z.literal(60),
  z.literal(75),
  z.literal(90),
]);

const CURRENT_YEAR = new Date().getUTCFullYear();

export const onboardingSchema = z.object({
  goal: z.enum(GOALS),
  experience: z.enum(EXPERIENCE_LEVELS),
  weekdays: z.array(weekday).min(MIN_TRAINING_DAYS).max(MAX_TRAINING_DAYS),
  sessionMinutes,
  locationType: z.enum(LOCATION_TYPES),
  equipment: z.array(z.enum(EQUIPMENT)),
  cardio: z.object({
    wanted: z.boolean(),
    types: z.array(z.enum(CARDIO_TYPES)),
    sessionsPerWeek: z.number().int().min(0).max(7),
  }),
  sex: z.enum(SEXES),
  birthYear: z
    .number()
    .int()
    .min(CURRENT_YEAR - 100)
    .max(CURRENT_YEAR - 12),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(400),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  injuries: z.array(z.enum(BODY_REGIONS)),
  injuryNote: z.string().trim().max(500),
  excludedExerciseIds: z.array(z.string().min(1).max(80)).max(200),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

export const saveSetSchema = z.object({
  id: z.uuid(),
  workoutExerciseId: z.string().min(1),
  position: z.number().int().min(0).max(99),
  type: z.enum(SET_TYPES),
  weightKg: z.number().min(0).max(2000).nullable(),
  reps: z.number().int().min(0).max(100000).nullable(),
  rir: z.number().int().min(0).max(10).nullable(),
  note: z.string().trim().max(300).nullable(),
  completed: z.boolean(),
});
export type SaveSetInput = z.infer<typeof saveSetSchema>;
