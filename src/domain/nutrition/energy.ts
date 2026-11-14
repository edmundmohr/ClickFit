/**
 * Kalorienbedarf und Makroziele: Grundumsatz nach Mifflin-St-Jeor, Aktivitätsfaktor,
 * Zuschlag für das Krafttraining und Anpassung an das Ziel.
 */
import type { ActivityLevel, Goal, Sex } from "@/domain/training/types";
import type { Macros } from "./types";

export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 } as const;
/** Energiegehalt von einem Kilogramm Körpergewebe (Näherung für Fett- und Muskelmasse gemischt). */
export const KCAL_PER_KG_BODY_WEIGHT = 7700;

export interface BodyData {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
}

export interface TrainingLoad {
  sessionsPerWeek: number;
  sessionMinutes: number;
}

/** Grundumsatz nach Mifflin-St-Jeor in kcal pro Tag. */
export function basalMetabolicRate(body: BodyData): number {
  const base = 10 * body.weightKg + 6.25 * body.heightCm - 5 * body.ageYears;
  return base + (body.sex === "male" ? 5 : -161);
}

/** Aktivität im Alltag, ohne Sport. */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Zusätzlicher Verbrauch durch Krafttraining über dem Ruhewert (netto etwa 3,5 MET). */
const TRAINING_NET_MET = 3.5;

export function trainingKcalPerDay(weightKg: number, load: TrainingLoad): number {
  const hoursPerWeek = (load.sessionsPerWeek * load.sessionMinutes) / 60;
  return (TRAINING_NET_MET * weightKg * hoursPerWeek) / 7;
}

/** Geschätzter Tagesverbrauch (TDEE) aus der Formel. */
export function estimateTdee(body: BodyData, activity: ActivityLevel, load: TrainingLoad): number {
  return basalMetabolicRate(body) * ACTIVITY_FACTORS[activity] + trainingKcalPerDay(body.weightKg, load);
}

/** Anpassung des Verbrauchs an das Ziel als Faktor. */
export const GOAL_FACTORS: Record<Goal, number> = {
  muscle_gain: 1.1,
  fat_loss: 0.8,
  recomposition: 0.95,
  maintain: 1,
};

/** Eiweiß in g pro kg Körpergewicht. */
const PROTEIN_PER_KG: Record<Goal, number> = {
  muscle_gain: 1.8,
  fat_loss: 2.2,
  recomposition: 2.2,
  maintain: 1.6,
};
const FAT_PER_KG = 0.9;
const MIN_FAT_SHARE = 0.2;
/** Untergrenzen, damit Diätziele nicht ungesund niedrig ausfallen. */
const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export interface NutritionTargets extends Macros {
  tdeeKcal: number;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/** Kalorien- und Makroziele aus Tagesverbrauch, Ziel und Körpergewicht. */
export function targetsFromTdee(tdeeKcal: number, goal: Goal, body: Pick<BodyData, "sex" | "weightKg">): NutritionTargets {
  const kcal = Math.max(roundTo(tdeeKcal * GOAL_FACTORS[goal], 10), MIN_KCAL[body.sex]);
  const proteinG = Math.round(PROTEIN_PER_KG[goal] * body.weightKg);
  const fatG = Math.round(Math.max(FAT_PER_KG * body.weightKg, (kcal * MIN_FAT_SHARE) / KCAL_PER_G.fat));
  const remaining = kcal - proteinG * KCAL_PER_G.protein - fatG * KCAL_PER_G.fat;
  const carbsG = Math.max(0, Math.round(remaining / KCAL_PER_G.carbs));
  return { kcal, proteinG, carbsG, fatG, tdeeKcal: Math.round(tdeeKcal) };
}

export function ageFromBirthYear(birthYear: number, currentYear: number): number {
  return Math.max(0, currentYear - birthYear);
}

/** Empfohlene Trinkmenge: etwa 35 ml pro kg Körpergewicht, auf 250 ml gerundet. */
export function recommendedWaterMl(weightKg: number): number {
  return Math.min(Math.max(roundTo(weightKg * 35, 250), 1500), 4500);
}
