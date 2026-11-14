/**
 * Cardio-Wochenplan: geplante Einheiten je Wochentag.
 */
import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { cardioPlanEntry } from "@/db/schema";
import { generateCardioPlan } from "@/domain/cardio/plan";
import {
  isCardioActivityType,
  isHeartRateZone,
  type CardioActivityType,
  type HeartRateZone,
  type Interval,
} from "@/domain/cardio/types";
import { GOALS, isOneOf, type Weekday } from "@/domain/training/types";
import { getProfile } from "@/features/training/services/profile-service";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/tokens";
import type { CardioPlanEntryInput } from "../schemas";

export interface CardioPlanEntry {
  id: string;
  weekday: Weekday;
  type: CardioActivityType;
  minutes: number;
  zone: HeartRateZone | null;
  intervals: Interval | null;
  note: string | null;
}

/** Wer im Fragebogen kein Cardio gewählt hat, bekommt beim Erzeugen diesen lockeren Einstieg. */
export const DEFAULT_SESSIONS_PER_WEEK = 2;

type PlanRow = typeof cardioPlanEntry.$inferSelect;

function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 1 && value <= 7;
}

function toEntry(row: PlanRow): CardioPlanEntry[] {
  if (!isWeekday(row.weekday)) return [];
  return [
    {
      id: row.id,
      weekday: row.weekday,
      type: isCardioActivityType(row.type) ? row.type : "cross_trainer",
      minutes: row.minutes,
      zone: isHeartRateZone(row.zone) ? row.zone : null,
      intervals: row.intervals,
      note: row.note,
    },
  ];
}

function toValues(input: CardioPlanEntryInput) {
  return {
    weekday: input.weekday,
    type: input.type,
    minutes: input.minutes,
    zone: input.zone,
    intervals: input.intervals,
    note: input.note || null,
  };
}

/** Alle geplanten Einheiten des Nutzers, nach Wochentag sortiert. */
export async function listCardioPlan(db: AppDatabase, userId: string): Promise<CardioPlanEntry[]> {
  const rows = await db.query.cardioPlanEntry.findMany({
    where: eq(cardioPlanEntry.userId, userId),
    orderBy: [asc(cardioPlanEntry.weekday), asc(cardioPlanEntry.createdAt), asc(cardioPlanEntry.id)],
  });
  return rows.flatMap(toEntry);
}

export async function addCardioPlanEntry(
  db: AppDatabase,
  userId: string,
  input: CardioPlanEntryInput,
  now = new Date(),
): Promise<string> {
  const id = newId();
  await db.insert(cardioPlanEntry).values({ id, userId, ...toValues(input), createdAt: now });
  return id;
}

export async function updateCardioPlanEntry(
  db: AppDatabase,
  userId: string,
  entryId: string,
  input: CardioPlanEntryInput,
): Promise<void> {
  const updated = await db
    .update(cardioPlanEntry)
    .set(toValues(input))
    .where(and(eq(cardioPlanEntry.id, entryId), eq(cardioPlanEntry.userId, userId)))
    .returning({ id: cardioPlanEntry.id });
  if (updated.length === 0) throw new AppError("NOT_FOUND");
}

export async function deleteCardioPlanEntry(db: AppDatabase, userId: string, entryId: string): Promise<void> {
  const deleted = await db
    .delete(cardioPlanEntry)
    .where(and(eq(cardioPlanEntry.id, entryId), eq(cardioPlanEntry.userId, userId)))
    .returning({ id: cardioPlanEntry.id });
  if (deleted.length === 0) throw new AppError("NOT_FOUND");
}

/**
 * Erzeugt den Wochenplan aus dem Fragebogen und ersetzt alle bisherigen Einträge.
 * Gibt die Zahl der geplanten Einheiten zurück.
 */
export async function createCardioPlanFromProfile(db: AppDatabase, userId: string, now = new Date()): Promise<number> {
  const stored = await getProfile(db, userId);
  if (!stored) throw new AppError("PROFILE_REQUIRED");
  const { profile } = stored;
  const wanted = profile.cardio.wanted && profile.cardio.sessionsPerWeek > 0;
  const sessions = generateCardioPlan({
    types: profile.cardio.types,
    sessionsPerWeek: wanted ? profile.cardio.sessionsPerWeek : DEFAULT_SESSIONS_PER_WEEK,
    trainingWeekdays: profile.weekdays,
    goal: isOneOf(GOALS, profile.goal) ? profile.goal : "maintain",
  });
  const remove = db.delete(cardioPlanEntry).where(eq(cardioPlanEntry.userId, userId));
  // Ein Eintrag pro Anweisung: so bleibt jede Anweisung weit unter den 100 Parametern von D1.
  const inserts = sessions.map((session) =>
    db.insert(cardioPlanEntry).values({
      id: newId(),
      userId,
      weekday: session.weekday,
      type: session.type,
      minutes: session.minutes,
      zone: session.zone,
      intervals: session.intervals,
      note: null,
      createdAt: now,
    }),
  );
  await db.batch([remove, ...inserts]);
  return sessions.length;
}
