/**
 * Verlauf, Kalender und Übersicht für „Heute“.
 */
import { and, desc, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { workoutExercise, workoutSession, workoutSet } from "@/db/schema";
import { sessionTotals, type LoggedSet } from "@/domain/training/records";
import { trainingStreak } from "@/domain/training/schedule";
import { DAY_FOCUSES, SET_TYPES, isOneOf, type DayFocus, type Weekday } from "@/domain/training/types";
import { addDays, startOfWeek, type LocalDate } from "@/lib/dates";

export interface SessionSummary {
  id: string;
  date: LocalDate;
  focus: DayFocus | null;
  durationMinutes: number | null;
  completedSets: number;
  volumeKg: number;
  exerciseCount: number;
}

async function summarize(
  db: AppDatabase,
  sessions: (typeof workoutSession.$inferSelect)[],
): Promise<SessionSummary[]> {
  if (sessions.length === 0) return [];
  const rows = await db
    .select({
      sessionId: workoutExercise.sessionId,
      workoutExerciseId: workoutExercise.id,
      type: workoutSet.type,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
    })
    .from(workoutSet)
    .innerJoin(workoutExercise, eq(workoutSet.workoutExerciseId, workoutExercise.id))
    .where(
      and(
        inArray(
          workoutExercise.sessionId,
          sessions.map((session) => session.id),
        ),
        isNotNull(workoutSet.completedAt),
      ),
    );

  return sessions.map((session) => {
    const own = rows.filter((row) => row.sessionId === session.id);
    const sets: LoggedSet[] = own.map((row) => ({
      type: isOneOf(SET_TYPES, row.type) ? row.type : "work",
      weightKg: row.weightKg,
      reps: row.reps,
      completed: true,
    }));
    const totals = sessionTotals(sets);
    const durationMs = session.finishedAt ? session.finishedAt.getTime() - session.startedAt.getTime() : null;
    return {
      id: session.id,
      date: session.date,
      focus: isOneOf(DAY_FOCUSES, session.focus) ? session.focus : null,
      durationMinutes: durationMs === null ? null : Math.max(1, Math.round(durationMs / 60000)),
      completedSets: totals.completedSets,
      volumeKg: totals.volumeKg,
      exerciseCount: new Set(own.map((row) => row.workoutExerciseId)).size,
    };
  });
}

export async function listCompletedSessions(
  db: AppDatabase,
  userId: string,
  limit = 30,
): Promise<SessionSummary[]> {
  const sessions = await db.query.workoutSession.findMany({
    where: and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed")),
    orderBy: [desc(workoutSession.date), desc(workoutSession.startedAt)],
    limit,
  });
  return summarize(db, sessions);
}

/** Abgeschlossene Einheiten in einem Datumsbereich (einschließlich beider Grenzen). */
export async function listSessionsBetween(
  db: AppDatabase,
  userId: string,
  from: LocalDate,
  to: LocalDate,
): Promise<SessionSummary[]> {
  const sessions = await db.query.workoutSession.findMany({
    where: and(
      eq(workoutSession.userId, userId),
      eq(workoutSession.status, "completed"),
      gte(workoutSession.date, from),
      lte(workoutSession.date, to),
    ),
    orderBy: [desc(workoutSession.date), desc(workoutSession.startedAt)],
  });
  return summarize(db, sessions);
}

export interface TrainingStats {
  streak: number;
  /** Abgeschlossene Trainingstage der laufenden Woche (Montag bis heute). */
  doneThisWeek: LocalDate[];
}

const STREAK_LOOKBACK_DAYS = 730;

export async function getTrainingStats(
  db: AppDatabase,
  userId: string,
  plannedWeekdays: readonly Weekday[],
  today: LocalDate,
): Promise<TrainingStats> {
  const rows = await db
    .selectDistinct({ date: workoutSession.date })
    .from(workoutSession)
    .where(
      and(
        eq(workoutSession.userId, userId),
        eq(workoutSession.status, "completed"),
        gte(workoutSession.date, addDays(today, -STREAK_LOOKBACK_DAYS)),
        ne(workoutSession.date, ""),
      ),
    );
  const dates = new Set(rows.map((row) => row.date));
  const monday = startOfWeek(today);
  return {
    streak: trainingStreak(dates, plannedWeekdays, today),
    doneThisWeek: [...dates].filter((date) => date >= monday && date <= today).sort(),
  };
}
