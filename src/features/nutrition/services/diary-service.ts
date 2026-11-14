/**
 * Ernährungstagebuch: Einträge anlegen, ändern, kopieren und auswerten.
 */
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { foodLogEntry } from "@/db/schema";
import { macrosForAmount, scaleMacros, sumMacros } from "@/domain/nutrition/macros";
import { AMOUNT_UNITS, MEALS, type AmountUnit, type FoodItem, type Macros, type Meal } from "@/domain/nutrition/types";
import { isOneOf } from "@/domain/training/types";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { getFood } from "./food-service";

/** D1 erlaubt höchstens 100 gebundene Parameter pro Anweisung. */
const LOG_INSERT_CHUNK = 7;
const SUGGESTION_LIMIT = 15;
const SUGGESTION_LOOKBACK = 400;

export interface LogEntryView extends Macros {
  id: string;
  meal: Meal;
  foodRef: string;
  name: string;
  amount: number;
  amountUnit: AmountUnit;
}

export interface DayView {
  date: LocalDate;
  meals: Record<Meal, LogEntryView[]>;
  total: Macros;
}

type LogRow = typeof foodLogEntry.$inferSelect;

function toView(row: LogRow): LogEntryView {
  return {
    id: row.id,
    meal: isOneOf(MEALS, row.meal) ? row.meal : "snack",
    foodRef: row.foodRef,
    name: row.name,
    amount: row.amount,
    amountUnit: isOneOf(AMOUNT_UNITS, row.amountUnit) ? row.amountUnit : "g",
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
  };
}

/** Lebensmittel samt berechneten Nährwerten für eine Menge; Fehler, wenn die Einheit nicht passt. */
export async function resolveAmount(
  db: AppDatabase,
  userId: string,
  input: { foodRef: string; amount: number; amountUnit: AmountUnit },
): Promise<{ food: FoodItem; macros: Macros }> {
  const food = await getFood(db, userId, input.foodRef);
  if (!food) throw new AppError("NOT_FOUND");
  const macros = macrosForAmount(food, input.amount, input.amountUnit);
  if (!macros) throw new AppError("VALIDATION");
  return { food, macros };
}

export function displayName(food: FoodItem): string {
  return food.brand ? `${food.name} (${food.brand})` : food.name;
}

export async function addLogEntry(
  db: AppDatabase,
  userId: string,
  input: { date: LocalDate; meal: Meal; foodRef: string; amount: number; amountUnit: AmountUnit },
): Promise<string> {
  const { food, macros } = await resolveAmount(db, userId, input);
  const id = newId();
  await db.insert(foodLogEntry).values({
    id,
    userId,
    date: input.date,
    meal: input.meal,
    foodRef: food.ref,
    name: displayName(food),
    amount: input.amount,
    amountUnit: input.amountUnit,
    ...macros,
    createdAt: new Date(),
  });
  return id;
}

async function getOwnedEntry(db: AppDatabase, userId: string, entryId: string): Promise<LogRow> {
  const row = await db.query.foodLogEntry.findFirst({
    where: and(eq(foodLogEntry.id, entryId), eq(foodLogEntry.userId, userId)),
  });
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** Ändert die Menge; die gespeicherten Nährwerte werden im selben Verhältnis angepasst. */
export async function updateLogAmount(db: AppDatabase, userId: string, entryId: string, amount: number): Promise<void> {
  const row = await getOwnedEntry(db, userId, entryId);
  if (row.amount <= 0) throw new AppError("VALIDATION");
  const scaled = scaleMacros(row, amount / row.amount);
  await db.update(foodLogEntry).set({ amount, ...scaled }).where(eq(foodLogEntry.id, entryId));
}

export async function deleteLogEntry(db: AppDatabase, userId: string, entryId: string): Promise<void> {
  await getOwnedEntry(db, userId, entryId);
  await db.delete(foodLogEntry).where(eq(foodLogEntry.id, entryId));
}

export async function getDay(db: AppDatabase, userId: string, date: LocalDate): Promise<DayView> {
  const rows = await db.query.foodLogEntry.findMany({
    where: and(eq(foodLogEntry.userId, userId), eq(foodLogEntry.date, date)),
    orderBy: asc(foodLogEntry.createdAt),
  });
  const entries = rows.map(toView);
  const meals: Record<Meal, LogEntryView[]> = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const entry of entries) meals[entry.meal].push(entry);
  return { date, meals, total: sumMacros(entries) };
}

/** Kopiert alle Einträge einer Mahlzeit von einem Tag auf einen anderen. Gibt die Anzahl zurück. */
export async function copyMeal(
  db: AppDatabase,
  userId: string,
  input: { fromDate: LocalDate; toDate: LocalDate; meal: Meal },
): Promise<number> {
  const source = await db.query.foodLogEntry.findMany({
    where: and(eq(foodLogEntry.userId, userId), eq(foodLogEntry.date, input.fromDate), eq(foodLogEntry.meal, input.meal)),
    orderBy: asc(foodLogEntry.createdAt),
  });
  const now = Date.now();
  const copies = source.map((row, index) => ({
    ...row,
    id: newId(),
    date: input.toDate,
    createdAt: new Date(now + index),
  }));
  for (let index = 0; index < copies.length; index += LOG_INSERT_CHUNK) {
    await db.insert(foodLogEntry).values(copies.slice(index, index + LOG_INSERT_CHUNK));
  }
  return copies.length;
}

export interface FoodSuggestion {
  foodRef: string;
  name: string;
  amount: number;
  amountUnit: AmountUnit;
  kcal: number;
}

function toSuggestion(row: Pick<LogRow, "foodRef" | "name" | "amount" | "amountUnit" | "kcal">): FoodSuggestion {
  return {
    foodRef: row.foodRef,
    name: row.name,
    amount: row.amount,
    amountUnit: isOneOf(AMOUNT_UNITS, row.amountUnit) ? row.amountUnit : "g",
    kcal: row.kcal,
  };
}

/** Zuletzt und am häufigsten eingetragene Lebensmittel, jeweils mit der zuletzt genutzten Menge. */
export async function getSuggestions(
  db: AppDatabase,
  userId: string,
): Promise<{ recent: FoodSuggestion[]; frequent: FoodSuggestion[] }> {
  const rows = await db.query.foodLogEntry.findMany({
    columns: { foodRef: true, name: true, amount: true, amountUnit: true, kcal: true },
    where: eq(foodLogEntry.userId, userId),
    orderBy: desc(foodLogEntry.createdAt),
    limit: SUGGESTION_LOOKBACK,
  });
  const latest = new Map<string, FoodSuggestion>();
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!latest.has(row.foodRef)) latest.set(row.foodRef, toSuggestion(row));
    counts.set(row.foodRef, (counts.get(row.foodRef) ?? 0) + 1);
  }
  const recent = [...latest.values()].slice(0, SUGGESTION_LIMIT);
  const frequent = [...latest.values()]
    .sort((a, b) => (counts.get(b.foodRef) ?? 0) - (counts.get(a.foodRef) ?? 0))
    .filter((item) => (counts.get(item.foodRef) ?? 0) > 1)
    .slice(0, SUGGESTION_LIMIT);
  return { recent, frequent };
}

export interface DailyTotal {
  date: LocalDate;
  kcal: number;
}

/** Kaloriensumme je Tag im Zeitraum (nur Tage mit Einträgen). */
export async function getDailyTotals(db: AppDatabase, userId: string, from: LocalDate, to: LocalDate): Promise<DailyTotal[]> {
  return db
    .select({ date: foodLogEntry.date, kcal: sql<number>`sum(${foodLogEntry.kcal})` })
    .from(foodLogEntry)
    .where(and(eq(foodLogEntry.userId, userId), gte(foodLogEntry.date, from), lte(foodLogEntry.date, to)))
    .groupBy(foodLogEntry.date)
    .orderBy(asc(foodLogEntry.date));
}
