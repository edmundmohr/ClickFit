import { z } from "zod";
import { ACTIVITY_TYPES } from "@/domain/cardio/types";
import { EQUIPMENT, EXERCISE_TYPES, MECHANICS, MOVEMENT_PATTERNS, MUSCLES } from "@/domain/exercises/types";
import {
  MAX_BODY_FAT,
  MAX_FOCUS_MUSCLES,
  MAX_TRAINING_MONTHS,
  MIN_BODY_FAT,
  SELF_ASSESSMENTS,
  WORK_POSTURES,
} from "@/domain/training/onboarding";
import { MAX_CYCLE_LENGTH, MIN_CYCLE_LENGTH } from "@/domain/training/cycle";
import { MAX_TARGET_WEIGHT_KG } from "@/domain/training/target-weight";
import { VACATION_TYPES } from "@/domain/training/vacation";
import { WEIGHT_UNITS } from "@/domain/training/weights";
import { isValidLocalDate, toLocalDate } from "@/lib/dates";
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

/** Laufendes Jahr in der Zeitzone der App, zum Zeitpunkt der Prüfung (nicht beim Laden des Moduls). */
function currentYear(): number {
  return Number(toLocalDate(new Date()).slice(0, 4));
}

const MAX_AGE_YEARS = 100;
const MIN_AGE_YEARS = 12;

export const onboardingSchema = z.object({
  goal: z.enum(GOALS),
  experience: z.enum(EXPERIENCE_LEVELS),
  // Doppelte Tage würden die Mindestzahl vortäuschen ([1, 1] wären sonst zwei Trainingstage).
  weekdays: z
    .array(weekday)
    .min(MIN_TRAINING_DAYS)
    .max(MAX_TRAINING_DAYS)
    .refine((days) => new Set(days).size === days.length),
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
    .refine((year) => year >= currentYear() - MAX_AGE_YEARS && year <= currentYear() - MIN_AGE_YEARS),
  heightCm: z.number().min(100).max(250),
  weightKg: z.number().min(30).max(400),
  activityLevel: z.enum(ACTIVITY_LEVELS),
  injuries: z.array(z.enum(BODY_REGIONS)),
  injuryNote: z.string().trim().max(500),
  excludedExerciseIds: z.array(z.string().min(1).max(80)).max(200),
  // Angaben des ausführlichen Fragebogens. Freiwillig, damit ältere Aufrufer gültig bleiben.
  bodyFatPercent: z.number().min(MIN_BODY_FAT).max(MAX_BODY_FAT).optional(),
  trainingMonths: z.number().int().min(0).max(MAX_TRAINING_MONTHS).optional(),
  trainedRecently: z.boolean().optional(),
  selfAssessment: z.enum(SELF_ASSESSMENTS).optional(),
  focusMuscles: z
    .array(z.enum(MUSCLES))
    .max(MAX_FOCUS_MUSCLES)
    .refine((muscles) => new Set(muscles).size === muscles.length)
    .optional(),
  workPostures: z.array(z.enum(WORK_POSTURES)).max(WORK_POSTURES.length).optional(),
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

const localDate = z.string().refine(isValidLocalDate);
const shortId = z.string().min(1).max(80);

export const gymSchema = z.object({
  name: z.string().trim().max(40),
  type: z.enum(LOCATION_TYPES),
  equipment: z.array(z.enum(EQUIPMENT)),
  plateUnit: z.enum(WEIGHT_UNITS).nullable(),
  barWeight: z.number().min(0).max(100).nullable(),
  plates: z
    .array(z.object({ weight: z.number().positive().max(100), pairs: z.number().int().min(1).max(20) }))
    .max(20)
    .nullable(),
  weightRules: z
    .array(
      z.object({
        equipment: z.enum(EQUIPMENT),
        unit: z.enum(WEIGHT_UNITS),
        increment: z.number().positive().max(100).nullable(),
        values: z.array(z.number().positive().max(1000)).max(80),
      }),
    )
    .max(EQUIPMENT.length),
});
export type GymInput = z.infer<typeof gymSchema>;

export const customExerciseSchema = z.object({
  name: z.string().trim().min(2).max(60),
  type: z.enum(EXERCISE_TYPES),
  mechanic: z.enum(MECHANICS),
  pattern: z.enum(MOVEMENT_PATTERNS),
  primary: z.array(z.enum(MUSCLES)).min(1).max(4),
  secondary: z.array(z.enum(MUSCLES)).max(6),
  equipment: z.array(z.enum(EQUIPMENT)).max(6),
  note: z.string().trim().max(600),
});
export type CustomExerciseInput = z.infer<typeof customExerciseSchema>;

export const routineExerciseSchema = z.object({
  exerciseId: shortId,
  sets: z.number().int().min(1).max(12),
  repMin: z.number().int().min(1).max(600),
  repMax: z.number().int().min(1).max(600),
  targetRir: z.number().int().min(0).max(5),
  restSeconds: z.number().int().min(0).max(900),
  groupId: z.string().min(1).max(40).nullable(),
  /** Eigenes Zielgewicht in kg; leer = automatisch (fehlt auch bei älteren, noch offenen Editor-Seiten). */
  targetWeightKg: z.number().min(0).max(MAX_TARGET_WEIGHT_KG).nullish(),
});

export const routineSchema = z.object({
  name: z.string().trim().max(40),
  /** 0 = kein fester Wochentag. */
  weekday: z.number().int().min(0).max(7),
  folderId: shortId,
  exercises: z.array(routineExerciseSchema).max(30),
});
export type RoutineInput = z.infer<typeof routineSchema>;

export const folderNameSchema = z.string().trim().min(1).max(40);

export const vacationSchema = z
  .object({
    type: z.enum(VACATION_TYPES),
    from: localDate,
    until: localDate,
    gymProfileId: shortId.nullable(),
  })
  .refine((value) => value.from <= value.until);

export const cycleSchema = z.object({
  enabled: z.boolean(),
  lastStart: localDate,
  lengthDays: z.number().int().min(MIN_CYCLE_LENGTH).max(MAX_CYCLE_LENGTH),
});

export const extraSportsSchema = z
  .array(z.object({ type: z.enum(ACTIVITY_TYPES), sessionsPerWeek: z.number().int().min(1).max(7) }))
  .max(6);

export const injuriesSchema = z.object({
  injuries: z.array(z.enum(BODY_REGIONS)),
  injuryNote: z.string().trim().max(500),
});
