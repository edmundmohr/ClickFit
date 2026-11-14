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

/** Eiweiß in g pro kg Referenzgewicht. */
const PROTEIN_PER_KG: Record<Goal, number> = {
  muscle_gain: 1.8,
  fat_loss: 2.2,
  recomposition: 2.2,
  maintain: 1.6,
};
/** Fett-Untergrenze in g pro kg Referenzgewicht. */
const FAT_PER_KG = 0.9;
/** Fett liefert mindestens ein Fünftel der Kalorien. */
const MIN_FAT_SHARE = 0.2;
/** Kohlenhydrate liefern mindestens diesen Anteil der Kalorien. */
const MIN_CARB_SHARE = 0.15;
/** BMI, bis zu dem das tatsächliche Gewicht als Referenz dient. */
const REFERENCE_BMI = 25;
/** Untergrenzen, damit Diätziele nicht ungesund niedrig ausfallen. */
const MIN_KCAL: Record<Sex, number> = { male: 1500, female: 1200 };

export interface NutritionTargets extends Macros {
  tdeeKcal: number;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

/**
 * Gewicht, auf das sich Eiweiß und Fett beziehen: das tatsächliche Gewicht, höchstens aber
 * das Gewicht bei BMI 25 für die angegebene Größe. Bei Übergewicht bestimmt vor allem die
 * Magermasse den Eiweißbedarf, nicht das gesamte Körpergewicht.
 */
export function referenceWeightKg(body: Pick<BodyData, "heightCm" | "weightKg">): number {
  const heightM = body.heightCm / 100;
  const bmi25Weight = REFERENCE_BMI * heightM * heightM;
  return heightM > 0 ? Math.min(body.weightKg, bmi25Weight) : body.weightKg;
}

/**
 * Kalorien- und Makroziele aus Tagesverbrauch, Ziel und Körperdaten.
 *
 * 1. Kalorien = Verbrauch × Zielfaktor, mindestens die sichere Untergrenze.
 * 2. Eiweiß = g/kg je Ziel × Referenzgewicht (siehe `referenceWeightKg`).
 * 3. Fett = max(0,9 g/kg × Referenzgewicht, 20 % der Kalorien).
 * 4. Eiweiß und Fett dürfen zusammen höchstens 85 % der Kalorien ausmachen, damit
 *    mindestens 15 % für Kohlenhydrate bleiben. Reicht das nicht, sinkt zuerst das Fett
 *    bis auf seine 20 %, danach das Eiweiß.
 * 5. Kohlenhydrate füllen den Rest, so dass die Makros die Kalorien ergeben (bis auf Rundung).
 */
export function targetsFromTdee(
  tdeeKcal: number,
  goal: Goal,
  body: Pick<BodyData, "sex" | "weightKg" | "heightCm">,
): NutritionTargets {
  const kcal = Math.max(roundTo(tdeeKcal * GOAL_FACTORS[goal], 10), MIN_KCAL[body.sex]);
  const reference = referenceWeightKg(body);
  let proteinKcal = PROTEIN_PER_KG[goal] * reference * KCAL_PER_G.protein;
  let fatKcal = Math.max(FAT_PER_KG * reference * KCAL_PER_G.fat, kcal * MIN_FAT_SHARE);
  const budget = kcal * (1 - MIN_CARB_SHARE);
  if (proteinKcal + fatKcal > budget) {
    fatKcal = Math.max(kcal * MIN_FAT_SHARE, budget - proteinKcal);
    proteinKcal = budget - fatKcal;
  }
  const proteinG = Math.round(proteinKcal / KCAL_PER_G.protein);
  const fatG = Math.round(fatKcal / KCAL_PER_G.fat);
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
