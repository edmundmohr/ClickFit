/**
 * Fachlogik des Fragebogens: Selbsteinschätzung, Körperfett-Schätzung, Zielprüfung,
 * empfohlene Trainingstage und Wochenplanung. Rein rechnerisch, ohne Framework.
 */
import type { Muscle } from "@/domain/exercises/types";
import type { ExperienceLevel, Goal, Sex, Weekday } from "./types";

/** Feinere Selbsteinschätzung; der Plan-Generator arbeitet weiter mit drei Erfahrungsstufen. */
export const SELF_ASSESSMENTS = ["newcomer", "returner", "beginner", "average", "advanced", "elite"] as const;
export type SelfAssessment = (typeof SELF_ASSESSMENTS)[number];

const EXPERIENCE_BY_ASSESSMENT: Record<SelfAssessment, ExperienceLevel> = {
  newcomer: "beginner",
  returner: "beginner",
  beginner: "beginner",
  average: "intermediate",
  advanced: "advanced",
  elite: "advanced",
};

export function experienceFromAssessment(assessment: SelfAssessment): ExperienceLevel {
  return EXPERIENCE_BY_ASSESSMENT[assessment];
}

/** Rückweg für Profile, die vor der feineren Einschätzung gespeichert wurden. */
export function assessmentFromExperience(experience: ExperienceLevel): SelfAssessment {
  if (experience === "advanced") return "advanced";
  return experience === "intermediate" ? "average" : "beginner";
}

/** Wählbare Trainingserfahrung in Monaten: erst fein, dann in größeren Schritten. */
export const TRAINING_AGE_STEPS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 18, 24, 36, 48, 60, 84, 120] as const;
export const MAX_TRAINING_MONTHS = 120;

const RETURNER_MIN_MONTHS = 6;
const AVERAGE_MIN_MONTHS = 12;
const ADVANCED_MIN_MONTHS = 36;
const ELITE_MIN_MONTHS = 84;

/**
 * Vorschlag für die Selbsteinschätzung aus Trainingsdauer und Regelmäßigkeit.
 * Wer länger dabei war, zuletzt aber pausiert hat, steigt als Wiedereinsteiger ein.
 */
export function suggestAssessment(trainingMonths: number, trainedRecently: boolean): SelfAssessment {
  if (trainingMonths <= 0) return "newcomer";
  if (!trainedRecently) return trainingMonths >= RETURNER_MIN_MONTHS ? "returner" : "newcomer";
  if (trainingMonths >= ELITE_MIN_MONTHS) return "elite";
  if (trainingMonths >= ADVANCED_MIN_MONTHS) return "advanced";
  if (trainingMonths >= AVERAGE_MIN_MONTHS) return "average";
  return "beginner";
}

export const MIN_BODY_FAT = 5;
export const MAX_BODY_FAT = 50;

export interface BodyFatInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
}

/**
 * Grobe Schätzung des Körperfettanteils aus BMI, Alter und Geschlecht (Deurenberg-Formel).
 * Bei sehr muskulösen Menschen liegt sie zu hoch; deshalb bleibt der Wert von Hand änderbar.
 */
export function estimateBodyFat({ sex, ageYears, heightCm, weightKg }: BodyFatInput): number {
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  const estimate = 1.2 * bmi + 0.23 * ageYears - (sex === "male" ? 10.8 : 0) - 5.4;
  return Math.min(MAX_BODY_FAT, Math.max(MIN_BODY_FAT, Math.round(estimate)));
}

export const BODY_FAT_BANDS = ["athletic", "fit", "average", "high", "very_high"] as const;
export type BodyFatBand = (typeof BODY_FAT_BANDS)[number];

/** Obergrenzen der Bereiche in Prozent; alles darüber ist „very_high“. */
const BAND_LIMITS: Record<Sex, [number, number, number, number]> = {
  male: [10, 17, 24, 30],
  female: [18, 25, 32, 38],
};

export function bodyFatBand(sex: Sex, percent: number): BodyFatBand {
  const index = BAND_LIMITS[sex].findIndex((limit) => percent <= limit);
  return BODY_FAT_BANDS[index === -1 ? BODY_FAT_BANDS.length - 1 : index];
}

/**
 * Ob ein Ziel zum Körperfettanteil passt. Bei hohem Anteil sind Aufbau und Halten nicht die
 * erste Wahl, bei sehr niedrigem das Abnehmen. Ohne Angabe gibt es keinen Hinweis.
 */
export function isGoalAdvisable(goal: Goal, sex: Sex, bodyFatPercent: number | null): boolean {
  if (bodyFatPercent === null) return true;
  const band = bodyFatBand(sex, bodyFatPercent);
  if (goal === "muscle_gain" || goal === "maintain") return band !== "high" && band !== "very_high";
  if (goal === "fat_loss") return band !== "athletic";
  return true;
}

/** Trainingstage pro Woche, die zur Erfahrung passen. */
const RECOMMENDED_DAY_COUNTS: Record<ExperienceLevel, readonly number[]> = {
  beginner: [2, 3],
  intermediate: [3, 4],
  advanced: [4, 5, 6],
};

export function recommendedDayCounts(experience: ExperienceLevel): readonly number[] {
  return RECOMMENDED_DAY_COUNTS[experience];
}

/** Gleichmäßig über die Woche verteilte Trainingstage als Ausgangspunkt der Wochenplanung. */
const DEFAULT_WEEKDAYS: Record<number, Weekday[]> = {
  1: [3],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
};

export function defaultWeekdays(dayCount: number): Weekday[] {
  const days = DEFAULT_WEEKDAYS[dayCount];
  if (!days) throw new RangeError(`No default weekdays for ${dayCount} training days.`);
  return [...days];
}

/** Verschiebt ein Training auf einen freien Tag. Ist das Ziel belegt, bleibt alles, wie es ist. */
export function moveTrainingDay(weekdays: readonly Weekday[], from: Weekday, to: Weekday): Weekday[] {
  if (!weekdays.includes(from) || weekdays.includes(to)) return [...weekdays];
  return weekdays.map((day) => (day === from ? to : day)).sort((a, b) => a - b);
}

/** Höchstens so viele Muskelgruppen lassen sich als Schwerpunkt wählen. */
export const MAX_FOCUS_MUSCLES = 2;

/** Wählt eine Muskelgruppe an oder ab; `null`, wenn die Obergrenze schon erreicht ist. */
export function toggleFocusMuscle(selected: readonly Muscle[], muscle: Muscle): Muscle[] | null {
  if (selected.includes(muscle)) return selected.filter((item) => item !== muscle);
  if (selected.length >= MAX_FOCUS_MUSCLES) return null;
  return [...selected, muscle];
}

/** Typische Belastungen im Beruf; mehrere Angaben sind möglich. */
export const WORK_POSTURES = [
  "sitting",
  "driving",
  "lifting",
  "kneeling",
  "leaning",
  "overhead",
  "rotating",
  "walking",
  "holding",
  "standing",
  "strenuous",
  "shift_work",
] as const;
export type WorkPosture = (typeof WORK_POSTURES)[number];
