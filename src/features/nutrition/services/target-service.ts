/**
 * Kalorien- und Makroziele: Erstberechnung aus dem Profil, wöchentlicher Check-in, manuelle Ziele.
 */
import { and, desc, eq, lte } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { nutritionTarget } from "@/db/schema";
import { CHECK_IN_WINDOW_DAYS, adaptiveTdee, isCheckInDue, type AdaptiveTdeeResult } from "@/domain/nutrition/adaptive";
import {
  ageFromBirthYear,
  estimateTdee,
  recommendedWaterMl,
  targetsFromTdee,
  type BodyData,
  type NutritionTargets,
} from "@/domain/nutrition/energy";
import type { Macros } from "@/domain/nutrition/types";
import { ACTIVITY_LEVELS, GOALS, SEXES, isOneOf, type ActivityLevel, type Goal } from "@/domain/training/types";
import { addDays, type LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { getProfile } from "@/features/training/services/profile-service";
import type { TargetInput } from "../schemas";
import { getDailyTotals } from "./diary-service";
import { getWeights } from "./tracking-service";

/** Zeitraum, in dem die jüngste Gewichtsmessung als aktuelles Gewicht gilt. */
const WEIGHT_LOOKBACK_DAYS = 90;

export const TARGET_SOURCES = ["formula", "adaptive", "manual"] as const;
export type TargetSource = (typeof TARGET_SOURCES)[number];

export interface TargetView extends Macros {
  startDate: LocalDate;
  source: TargetSource;
  tdeeKcal: number | null;
}

interface EnergyProfile {
  body: BodyData;
  goal: Goal;
  activity: ActivityLevel;
  load: { sessionsPerWeek: number; sessionMinutes: number };
}

/** Körperdaten für die Berechnung; das Gewicht kommt aus der jüngsten Messung, sonst aus dem Profil. */
async function getEnergyProfile(db: AppDatabase, userId: string, today: LocalDate): Promise<EnergyProfile | null> {
  const stored = await getProfile(db, userId);
  if (!stored) return null;
  const { profile } = stored;
  const weights = await getWeights(db, userId, addDays(today, -WEIGHT_LOOKBACK_DAYS), today);
  return {
    body: {
      sex: isOneOf(SEXES, profile.sex) ? profile.sex : "male",
      ageYears: ageFromBirthYear(profile.birthYear, Number(today.slice(0, 4))),
      heightCm: profile.heightCm,
      weightKg: weights.at(-1)?.weightKg ?? profile.weightKg,
    },
    goal: isOneOf(GOALS, profile.goal) ? profile.goal : "maintain",
    activity: isOneOf(ACTIVITY_LEVELS, profile.activityLevel) ? profile.activityLevel : "light",
    load: { sessionsPerWeek: profile.weekdays.length, sessionMinutes: profile.sessionMinutes },
  };
}

function formulaTdee(profile: EnergyProfile): number {
  return estimateTdee(profile.body, profile.activity, profile.load);
}

export async function getCurrentTarget(db: AppDatabase, userId: string, date: LocalDate): Promise<TargetView | null> {
  const row = await db.query.nutritionTarget.findFirst({
    where: and(eq(nutritionTarget.userId, userId), lte(nutritionTarget.startDate, date)),
    orderBy: [desc(nutritionTarget.startDate), desc(nutritionTarget.createdAt)],
  });
  if (!row) return null;
  return {
    startDate: row.startDate,
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    source: isOneOf(TARGET_SOURCES, row.source) ? row.source : "manual",
    tdeeKcal: row.tdeeKcal,
  };
}

async function insertTarget(
  db: AppDatabase,
  userId: string,
  startDate: LocalDate,
  macros: Macros,
  source: TargetSource,
  tdeeKcal: number | null,
): Promise<void> {
  await db.insert(nutritionTarget).values({
    id: newId(),
    userId,
    startDate,
    kcal: Math.round(macros.kcal),
    proteinG: Math.round(macros.proteinG),
    carbsG: Math.round(macros.carbsG),
    fatG: Math.round(macros.fatG),
    source,
    tdeeKcal,
    createdAt: new Date(),
  });
}

/** Berechnet die Ziele aus dem Profil neu und speichert sie ab heute. `null` ohne Profil. */
export async function recalculateTarget(db: AppDatabase, userId: string, today: LocalDate): Promise<NutritionTargets | null> {
  const profile = await getEnergyProfile(db, userId, today);
  if (!profile) return null;
  const targets = targetsFromTdee(formulaTdee(profile), profile.goal, profile.body);
  await insertTarget(db, userId, today, targets, "formula", targets.tdeeKcal);
  return targets;
}

/** Liefert das aktuelle Ziel; gibt es noch keins, wird es einmalig aus dem Profil berechnet. */
export async function ensureTarget(db: AppDatabase, userId: string, today: LocalDate): Promise<TargetView | null> {
  const current = await getCurrentTarget(db, userId, today);
  if (current) return current;
  const created = await recalculateTarget(db, userId, today);
  return created ? getCurrentTarget(db, userId, today) : null;
}

export async function setManualTarget(db: AppDatabase, userId: string, today: LocalDate, input: TargetInput): Promise<void> {
  await insertTarget(db, userId, today, input, "manual", null);
}

export interface CheckIn {
  due: boolean;
  proposal: NutritionTargets;
  analysis: AdaptiveTdeeResult;
}

/**
 * Wöchentlicher Check-in: schätzt den tatsächlichen Verbrauch aus Zufuhr und Gewichtstrend
 * der letzten Wochen und leitet daraus neue Ziele ab. `null` ohne Profil oder ohne Ziel.
 */
export async function getCheckIn(db: AppDatabase, userId: string, today: LocalDate): Promise<CheckIn | null> {
  const [profile, current] = await Promise.all([getEnergyProfile(db, userId, today), getCurrentTarget(db, userId, today)]);
  if (!profile || !current) return null;
  const to = addDays(today, -1);
  const from = addDays(to, -(CHECK_IN_WINDOW_DAYS - 1));
  const [intake, weights] = await Promise.all([
    getDailyTotals(db, userId, from, to),
    getWeights(db, userId, from, to),
  ]);
  const analysis = adaptiveTdee({ intake, weights, from, to, formulaTdeeKcal: formulaTdee(profile) });
  return {
    due: isCheckInDue(current.startDate, today),
    proposal: targetsFromTdee(analysis.tdeeKcal, profile.goal, profile.body),
    analysis,
  };
}

export async function applyCheckIn(db: AppDatabase, userId: string, today: LocalDate): Promise<void> {
  const checkIn = await getCheckIn(db, userId, today);
  if (!checkIn) return;
  const source: TargetSource = checkIn.analysis.confidence > 0 ? "adaptive" : "formula";
  await insertTarget(db, userId, today, checkIn.proposal, source, checkIn.proposal.tdeeKcal);
}

/** Empfohlene Trinkmenge aus dem Körpergewicht; `null` ohne Profil. */
export async function getRecommendedWater(db: AppDatabase, userId: string, today: LocalDate): Promise<number | null> {
  const profile = await getEnergyProfile(db, userId, today);
  return profile ? recommendedWaterMl(profile.body.weightKg) : null;
}
