/**
 * Wasser, Supplements und Körpergewicht.
 */
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { bodyWeightEntry, nutritionSettings, supplement, supplementLog, waterLog } from "@/db/schema";
import { weightTrend, type TrendPoint, type WeightPoint } from "@/domain/nutrition/adaptive";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { SUPPLEMENT_TIMINGS, type SupplementInput, type SupplementTiming } from "../schemas";
import { isOneOf } from "@/domain/training/types";

export const DEFAULT_WATER_GOAL_ML = 2500;

export async function getWaterTotal(db: AppDatabase, userId: string, date: LocalDate): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${waterLog.amountMl}), 0)` })
    .from(waterLog)
    .where(and(eq(waterLog.userId, userId), eq(waterLog.date, date)));
  return row?.total ?? 0;
}

export async function addWater(db: AppDatabase, userId: string, date: LocalDate, amountMl: number): Promise<void> {
  await db.insert(waterLog).values({ id: newId(), userId, date, amountMl, createdAt: new Date() });
}

/** Nimmt den zuletzt eingetragenen Schluck des Tages zurück. */
export async function undoLastWater(db: AppDatabase, userId: string, date: LocalDate): Promise<void> {
  const last = await db.query.waterLog.findFirst({
    where: and(eq(waterLog.userId, userId), eq(waterLog.date, date)),
    orderBy: desc(waterLog.createdAt),
  });
  if (last) await db.delete(waterLog).where(eq(waterLog.id, last.id));
}

export async function getWaterGoal(db: AppDatabase, userId: string): Promise<number | null> {
  const row = await db.query.nutritionSettings.findFirst({ where: eq(nutritionSettings.userId, userId) });
  return row?.waterGoalMl ?? null;
}

export async function setWaterGoal(db: AppDatabase, userId: string, waterGoalMl: number): Promise<void> {
  const updatedAt = new Date();
  await db
    .insert(nutritionSettings)
    .values({ userId, waterGoalMl, updatedAt })
    .onConflictDoUpdate({ target: nutritionSettings.userId, set: { waterGoalMl, updatedAt } });
}

/** Tage im Zeitraum, an denen das Wasserziel erreicht wurde. */
export async function getWaterGoalDates(
  db: AppDatabase,
  userId: string,
  from: LocalDate,
  to: LocalDate,
  goalMl: number,
): Promise<LocalDate[]> {
  const rows = await db
    .select({ date: waterLog.date, total: sql<number>`sum(${waterLog.amountMl})` })
    .from(waterLog)
    .where(and(eq(waterLog.userId, userId), gte(waterLog.date, from), lte(waterLog.date, to)))
    .groupBy(waterLog.date);
  return rows.filter((row) => row.total >= goalMl).map((row) => row.date);
}

export interface SupplementView {
  id: string;
  name: string;
  dose: string | null;
  timing: SupplementTiming;
  taken: boolean;
}

export async function listSupplements(db: AppDatabase, userId: string, date: LocalDate): Promise<SupplementView[]> {
  const [items, logs] = await Promise.all([
    db.query.supplement.findMany({ where: eq(supplement.userId, userId), orderBy: asc(supplement.createdAt) }),
    db.query.supplementLog.findMany({
      columns: { supplementId: true },
      where: and(eq(supplementLog.userId, userId), eq(supplementLog.date, date)),
    }),
  ]);
  const taken = new Set(logs.map((log) => log.supplementId));
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    dose: item.dose,
    timing: isOneOf(SUPPLEMENT_TIMINGS, item.timing) ? item.timing : "any",
    taken: taken.has(item.id),
  }));
}

export async function addSupplement(db: AppDatabase, userId: string, input: SupplementInput): Promise<void> {
  await db.insert(supplement).values({
    id: newId(),
    userId,
    name: input.name,
    dose: input.dose || null,
    timing: input.timing,
    createdAt: new Date(),
  });
}

async function getOwnedSupplement(db: AppDatabase, userId: string, supplementId: string) {
  const row = await db.query.supplement.findFirst({
    where: and(eq(supplement.id, supplementId), eq(supplement.userId, userId)),
  });
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

export async function deleteSupplement(db: AppDatabase, userId: string, supplementId: string): Promise<void> {
  await getOwnedSupplement(db, userId, supplementId);
  await db.delete(supplement).where(eq(supplement.id, supplementId));
}

export async function setSupplementTaken(
  db: AppDatabase,
  userId: string,
  supplementId: string,
  date: LocalDate,
  taken: boolean,
): Promise<void> {
  await getOwnedSupplement(db, userId, supplementId);
  if (taken) {
    await db.insert(supplementLog).values({ supplementId, userId, date, takenAt: new Date() }).onConflictDoNothing();
  } else {
    await db
      .delete(supplementLog)
      .where(and(eq(supplementLog.supplementId, supplementId), eq(supplementLog.date, date)));
  }
}

/** Trägt das Gewicht für einen Tag ein; ein zweiter Eintrag am selben Tag ersetzt den ersten. */
export async function saveWeight(db: AppDatabase, userId: string, date: LocalDate, weightKg: number): Promise<void> {
  await db
    .insert(bodyWeightEntry)
    .values({ id: newId(), userId, date, weightKg, source: "manual", createdAt: new Date() })
    // Ein von Hand eingetragener Wert gilt als manuell – auch wenn er einen importierten ersetzt.
    // So überschreibt der nächste Import die Korrektur nicht wieder.
    .onConflictDoUpdate({ target: [bodyWeightEntry.userId, bodyWeightEntry.date], set: { weightKg, source: "manual" } });
}

export async function getWeights(db: AppDatabase, userId: string, from: LocalDate, to: LocalDate): Promise<WeightPoint[]> {
  return db
    .select({ date: bodyWeightEntry.date, weightKg: bodyWeightEntry.weightKg })
    .from(bodyWeightEntry)
    .where(and(eq(bodyWeightEntry.userId, userId), gte(bodyWeightEntry.date, from), lte(bodyWeightEntry.date, to)))
    .orderBy(asc(bodyWeightEntry.date));
}

/** Gewichtseintrag mit Herkunft für die Liste im Fortschritt. */
export interface WeightEntryView extends WeightPoint {
  /** `manual` (von Hand) oder `import` (Health-Import, Home Assistant, CSV). */
  source: string;
}

/** Alle Gewichtseinträge bis `to`, ab `from` (ohne Startdatum seit der ersten Messung), aufsteigend. */
export async function getWeightEntries(
  db: AppDatabase,
  userId: string,
  from: LocalDate | null,
  to: LocalDate,
): Promise<WeightEntryView[]> {
  const conditions = [eq(bodyWeightEntry.userId, userId), lte(bodyWeightEntry.date, to)];
  if (from !== null) conditions.push(gte(bodyWeightEntry.date, from));
  return db
    .select({ date: bodyWeightEntry.date, weightKg: bodyWeightEntry.weightKg, source: bodyWeightEntry.source })
    .from(bodyWeightEntry)
    .where(and(...conditions))
    .orderBy(asc(bodyWeightEntry.date));
}

/** Löscht die Messung eines Tages; fehlt sie, gilt das als Fehler. */
export async function deleteWeight(db: AppDatabase, userId: string, date: LocalDate): Promise<void> {
  const deleted = await db
    .delete(bodyWeightEntry)
    .where(and(eq(bodyWeightEntry.userId, userId), eq(bodyWeightEntry.date, date)))
    .returning({ id: bodyWeightEntry.id });
  if (deleted.length === 0) throw new AppError("NOT_FOUND");
}

export interface WeightStatus {
  /** Heutiger Messwert, falls schon eingetragen. */
  today: number | null;
  latest: TrendPoint | null;
}

export async function getWeightStatus(db: AppDatabase, userId: string, from: LocalDate, today: LocalDate): Promise<WeightStatus> {
  const trend = weightTrend(await getWeights(db, userId, from, today));
  const latest = trend.at(-1) ?? null;
  return { today: latest?.date === today ? latest.weightKg : null, latest };
}
