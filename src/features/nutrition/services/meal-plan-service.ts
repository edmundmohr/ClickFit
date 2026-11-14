/**
 * Wochenplan der Ernährung: pro Wochentag und Mahlzeit vorgesehene Lebensmittel und Rezepte.
 */
import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { foodLogEntry, mealPlanEntry } from "@/db/schema";
import { sumMacros } from "@/domain/nutrition/macros";
import { AMOUNT_UNITS, MEALS, type AmountUnit, type Macros, type Meal } from "@/domain/nutrition/types";
import { isOneOf, type Weekday } from "@/domain/training/types";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { displayName, resolveAmount } from "./diary-service";

const LOG_INSERT_CHUNK = 7;

export interface PlanEntryView extends Macros {
  id: string;
  weekday: Weekday;
  meal: Meal;
  name: string;
  amount: number;
  amountUnit: AmountUnit;
}

export interface PlanDayView {
  weekday: Weekday;
  meals: Record<Meal, PlanEntryView[]>;
  total: Macros;
}

export async function getPlanDay(db: AppDatabase, userId: string, weekday: Weekday): Promise<PlanDayView> {
  const rows = await db.query.mealPlanEntry.findMany({
    where: and(eq(mealPlanEntry.userId, userId), eq(mealPlanEntry.weekday, weekday)),
    orderBy: asc(mealPlanEntry.createdAt),
  });
  const entries: PlanEntryView[] = rows.map((row) => ({
    id: row.id,
    weekday,
    meal: isOneOf(MEALS, row.meal) ? row.meal : "snack",
    name: row.name,
    amount: row.amount,
    amountUnit: isOneOf(AMOUNT_UNITS, row.amountUnit) ? row.amountUnit : "g",
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
  }));
  const meals: Record<Meal, PlanEntryView[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const entry of entries) meals[entry.meal].push(entry);
  return { weekday, meals, total: sumMacros(entries) };
}

/** Kaloriensumme je Wochentag, für die Übersicht der Woche. */
export async function getPlanWeekTotals(db: AppDatabase, userId: string): Promise<Map<number, number>> {
  const rows = await db.query.mealPlanEntry.findMany({
    columns: { weekday: true, kcal: true },
    where: eq(mealPlanEntry.userId, userId),
  });
  const totals = new Map<number, number>();
  for (const row of rows) totals.set(row.weekday, (totals.get(row.weekday) ?? 0) + row.kcal);
  return totals;
}

export async function addPlanEntry(
  db: AppDatabase,
  userId: string,
  input: { weekday: number; meal: Meal; foodRef: string; amount: number; amountUnit: AmountUnit },
): Promise<void> {
  const { food, macros } = await resolveAmount(db, userId, input);
  await db.insert(mealPlanEntry).values({
    id: newId(),
    userId,
    weekday: input.weekday,
    meal: input.meal,
    foodRef: food.ref,
    name: displayName(food),
    amount: input.amount,
    amountUnit: input.amountUnit,
    ...macros,
    createdAt: new Date(),
  });
}

export async function deletePlanEntry(db: AppDatabase, userId: string, entryId: string): Promise<void> {
  const deleted = await db
    .delete(mealPlanEntry)
    .where(and(eq(mealPlanEntry.id, entryId), eq(mealPlanEntry.userId, userId)))
    .returning({ id: mealPlanEntry.id });
  if (deleted.length === 0) throw new AppError("NOT_FOUND");
}

/** Überträgt den Plan eines Wochentags ins Tagebuch des angegebenen Datums. Gibt die Anzahl zurück. */
export async function applyPlanDay(db: AppDatabase, userId: string, weekday: Weekday, date: LocalDate): Promise<number> {
  const rows = await db.query.mealPlanEntry.findMany({
    where: and(eq(mealPlanEntry.userId, userId), eq(mealPlanEntry.weekday, weekday)),
    orderBy: asc(mealPlanEntry.createdAt),
  });
  const now = Date.now();
  const entries = rows.map((row, index) => ({
    id: newId(),
    userId,
    date,
    meal: row.meal,
    foodRef: row.foodRef,
    name: row.name,
    amount: row.amount,
    amountUnit: row.amountUnit,
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    createdAt: new Date(now + index),
  }));
  for (let index = 0; index < entries.length; index += LOG_INSERT_CHUNK) {
    await db.insert(foodLogEntry).values(entries.slice(index, index + LOG_INSERT_CHUNK));
  }
  return entries.length;
}
