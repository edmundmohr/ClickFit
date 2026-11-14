/**
 * Mobility-Protokoll: abgeschlossene Routinen eintragen, auflisten und auswerten.
 * Die Routinen selbst sind Daten im Code (`src/data/mobility`).
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { MOBILITY_ROUTINES_BY_ID } from "@/data/mobility";
import type { AppDatabase } from "@/db/client";
import { mobilityLog } from "@/db/schema";
import { MOBILITY_STREAK_LOOKBACK_DAYS, mobilityStreak } from "@/domain/mobility/streak";
import { addDays, type LocalDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/tokens";

export interface MobilityLogInput {
  routineId: string;
  /** Lokales Datum (YYYY-MM-DD), an dem die Routine gemacht wurde. */
  date: LocalDate;
  durationSeconds: number;
}

export interface MobilityLogEntry {
  id: string;
  routineId: string;
  date: LocalDate;
  durationSeconds: number;
  completedAt: Date;
}

const entryColumns = {
  id: mobilityLog.id,
  routineId: mobilityLog.routineId,
  date: mobilityLog.date,
  durationSeconds: mobilityLog.durationSeconds,
  completedAt: mobilityLog.completedAt,
};

/** Trägt eine abgeschlossene Routine ein. Mehrere Einträge am selben Tag sind erlaubt. */
export async function logRoutine(db: AppDatabase, userId: string, input: MobilityLogInput): Promise<MobilityLogEntry> {
  if (!MOBILITY_ROUTINES_BY_ID.has(input.routineId)) throw new AppError("NOT_FOUND");
  const entry: MobilityLogEntry = {
    id: newId(),
    routineId: input.routineId,
    date: input.date,
    durationSeconds: input.durationSeconds,
    completedAt: new Date(),
  };
  await db.insert(mobilityLog).values({ ...entry, userId });
  return entry;
}

/** Einträge im Zeitraum (beide Tage eingeschlossen), die neuesten zuerst. */
export async function listLogs(
  db: AppDatabase,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<MobilityLogEntry[]> {
  return db
    .select(entryColumns)
    .from(mobilityLog)
    .where(and(eq(mobilityLog.userId, userId), gte(mobilityLog.date, from), lte(mobilityLog.date, to)))
    .orderBy(desc(mobilityLog.date), desc(mobilityLog.completedAt));
}

/** Je Routine das Datum, an dem sie zuletzt gemacht wurde. */
export async function getLastDoneByRoutine(db: AppDatabase, userId: string): Promise<Map<string, LocalDate>> {
  const rows = await db
    .select({ routineId: mobilityLog.routineId, date: sql<LocalDate>`max(${mobilityLog.date})` })
    .from(mobilityLog)
    .where(eq(mobilityLog.userId, userId))
    .groupBy(mobilityLog.routineId);
  return new Map(rows.map((row) => [row.routineId, row.date]));
}

/** Tage in Folge mit mindestens einer Routine; heute zählt erst als Lücke, wenn der Tag vorbei ist. */
export async function getMobilityStreak(db: AppDatabase, userId: string, today: LocalDate): Promise<number> {
  const rows = await db
    .selectDistinct({ date: mobilityLog.date })
    .from(mobilityLog)
    .where(
      and(
        eq(mobilityLog.userId, userId),
        gte(mobilityLog.date, addDays(today, -MOBILITY_STREAK_LOOKBACK_DAYS)),
        lte(mobilityLog.date, today),
      ),
    );
  return mobilityStreak(
    rows.map((row) => row.date),
    today,
  );
}

/** Löscht einen eigenen Eintrag; fremde oder unbekannte Einträge gelten als nicht gefunden. */
export async function deleteLog(db: AppDatabase, userId: string, logId: string): Promise<void> {
  const deleted = await db
    .delete(mobilityLog)
    .where(and(eq(mobilityLog.id, logId), eq(mobilityLog.userId, userId)))
    .returning({ id: mobilityLog.id });
  if (deleted.length === 0) throw new AppError("NOT_FOUND");
}
