/**
 * Grundtypen für Profil, Trainingsplan und Workout. Reine Typen ohne Framework.
 */
import type { Equipment, Muscle } from "@/domain/exercises/types";

export const GOALS = ["muscle_gain", "fat_loss", "recomposition", "maintain"] as const;
export type Goal = (typeof GOALS)[number];

export const EXPERIENCE_LEVELS = ["beginner", "intermediate", "advanced"] as const;
export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export const SESSION_MINUTES = [30, 45, 60, 75, 90] as const;
export type SessionMinutes = (typeof SESSION_MINUTES)[number];

export const LOCATION_TYPES = ["gym", "home", "travel"] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITY_LEVELS = ["sedentary", "light", "moderate", "active", "very_active"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const CARDIO_TYPES = ["running", "cycling", "rowing", "walking", "swimming", "other"] as const;
export type CardioType = (typeof CARDIO_TYPES)[number];

/** Körperregionen für Beschwerden. Der Verletztenmodus (Phase 5) meidet passende Bewegungsmuster. */
export const BODY_REGIONS = [
  "shoulder",
  "elbow",
  "wrist",
  "lower_back",
  "hip",
  "knee",
  "ankle",
  "neck",
] as const;
export type BodyRegion = (typeof BODY_REGIONS)[number];

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 7];
export const MIN_TRAINING_DAYS = 1;
export const MAX_TRAINING_DAYS = 6;

export const SPLITS = ["full_body", "upper_lower", "upper_lower_ppl", "push_pull_legs"] as const;
export type Split = (typeof SPLITS)[number];

export const DAY_FOCUSES = [
  "full_body_a",
  "full_body_b",
  "full_body_c",
  "upper_a",
  "upper_b",
  "lower_a",
  "lower_b",
  "push_a",
  "push_b",
  "pull_a",
  "pull_b",
  "legs_a",
  "legs_b",
] as const;
export type DayFocus = (typeof DAY_FOCUSES)[number];

export const SET_TYPES = ["warmup", "work", "failure", "drop"] as const;
export type SetType = (typeof SET_TYPES)[number];

/** Wie sich eine Übung angefühlt hat (Abfrage nach dem letzten Satz). */
export const EFFORT_LEVELS = ["easy", "right", "hard", "max"] as const;
export type EffortLevel = (typeof EFFORT_LEVELS)[number];
/** Höchster wählbarer RIR-Wert bei der Abfrage; er steht für „4 oder mehr“. */
export const MAX_FEEDBACK_RIR = 4;

/** Rückmeldung zu einer Übung im Training. Beide Angaben sind freiwillig. */
export interface ExerciseFeedback {
  effort: EffortLevel | null;
  rir: number | null;
}

export interface CardioPreference {
  wanted: boolean;
  types: CardioType[];
  sessionsPerWeek: number;
}

/** Was der Plan-Generator über den Nutzer wissen muss. */
export interface TrainingProfile {
  goal: Goal;
  experience: ExperienceLevel;
  weekdays: Weekday[];
  sessionMinutes: SessionMinutes;
  equipment: Equipment[];
  excludedExerciseIds: string[];
  injuries: BodyRegion[];
  /** Schwerpunkt-Muskelgruppen: Ihre Übungen bekommen einen Satz mehr, wenn die Zeit reicht. */
  focusMuscles?: Muscle[];
}

export interface PlannedExercise {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
}

export interface PlannedDay {
  focus: DayFocus;
  weekday: Weekday;
  exercises: PlannedExercise[];
}

export interface GeneratedPlan {
  split: Split;
  deloadEveryWeeks: number;
  days: PlannedDay[];
}

export function isOneOf<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
