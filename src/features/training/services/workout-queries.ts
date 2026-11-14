/**
 * Lesende Abfragen rund um Workouts: letzte Leistung, bisherige Bestwerte, Besitzprüfung.
 */
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { workoutExercise, workoutSession, workoutSet } from "@/db/schema";
import type { PerformedSet } from "@/domain/training/progression";
import { bestsOf, type ExerciseBests, type LoggedSet } from "@/domain/training/records";
import { SET_TYPES, isOneOf } from "@/domain/training/types";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";

export interface PreviousPerformance {
  date: LocalDate;
  sets: PerformedSet[];
}

/**
 * Arbeitssätze der letzten abgeschlossenen regulären Einheit je Übung
 * (ohne Deload-Wochen, ohne Aufwärmsätze). Basis für Vorwerte und Progression.
 */
export async function getPreviousPerformances(
  db: AppDatabase,
  userId: string,
  exerciseIds: string[],
  excludeSessionId?: string,
): Promise<Map<string, PreviousPerformance>> {
  const result = new Map<string, PreviousPerformance>();
  if (exerciseIds.length === 0) return result;

  const rows = await db
    .select({
      exerciseId: workoutExercise.exerciseId,
      sessionId: workoutSession.id,
      date: workoutSession.date,
      startedAt: workoutSession.startedAt,
      position: workoutSet.position,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
      rir: workoutSet.rir,
    })
    .from(workoutSet)
    .innerJoin(workoutExercise, eq(workoutSet.workoutExerciseId, workoutExercise.id))
    .innerJoin(workoutSession, eq(workoutExercise.sessionId, workoutSession.id))
    .where(
      and(
        eq(workoutExercise.userId, userId),
        inArray(workoutExercise.exerciseId, exerciseIds),
        eq(workoutSession.status, "completed"),
        eq(workoutSession.isDeload, false),
        isNotNull(workoutSet.completedAt),
        ne(workoutSet.type, "warmup"),
        excludeSessionId ? ne(workoutSession.id, excludeSessionId) : undefined,
      ),
    )
    .orderBy(desc(workoutSession.date), desc(workoutSession.startedAt), asc(workoutSet.position));

  // Die Zeilen sind nach Datum absteigend sortiert: Pro Übung zählt nur die erste Einheit.
  const sessionByExercise = new Map<string, string>();
  for (const row of rows) {
    const chosen = sessionByExercise.get(row.exerciseId);
    if (chosen === undefined) {
      sessionByExercise.set(row.exerciseId, row.sessionId);
      result.set(row.exerciseId, { date: row.date, sets: [] });
    } else if (chosen !== row.sessionId) {
      continue;
    }
    result.get(row.exerciseId)?.sets.push({ weightKg: row.weightKg, reps: row.reps, rir: row.rir });
  }
  return result;
}

/** Bestwerte je Übung aus allen früheren abgeschlossenen Einheiten. Fehlt eine Übung, gibt es keine Historie. */
export async function getExerciseBests(
  db: AppDatabase,
  userId: string,
  exerciseIds: string[],
  excludeSessionId: string,
): Promise<Map<string, ExerciseBests>> {
  const result = new Map<string, ExerciseBests>();
  if (exerciseIds.length === 0) return result;
  const rows = await db
    .select({
      exerciseId: workoutExercise.exerciseId,
      type: workoutSet.type,
      weightKg: workoutSet.weightKg,
      reps: workoutSet.reps,
    })
    .from(workoutSet)
    .innerJoin(workoutExercise, eq(workoutSet.workoutExerciseId, workoutExercise.id))
    .innerJoin(workoutSession, eq(workoutExercise.sessionId, workoutSession.id))
    .where(
      and(
        eq(workoutExercise.userId, userId),
        inArray(workoutExercise.exerciseId, exerciseIds),
        eq(workoutSession.status, "completed"),
        ne(workoutSession.id, excludeSessionId),
        isNotNull(workoutSet.completedAt),
      ),
    );

  const grouped = new Map<string, LoggedSet[]>();
  for (const row of rows) {
    const sets = grouped.get(row.exerciseId) ?? [];
    sets.push({
      type: isOneOf(SET_TYPES, row.type) ? row.type : "work",
      weightKg: row.weightKg,
      reps: row.reps,
      completed: true,
    });
    grouped.set(row.exerciseId, sets);
  }
  for (const [exerciseId, sets] of grouped) result.set(exerciseId, bestsOf(sets));
  return result;
}

export async function getOwnedSession(db: AppDatabase, userId: string, sessionId: string) {
  const session = await db.query.workoutSession.findFirst({
    where: and(eq(workoutSession.id, sessionId), eq(workoutSession.userId, userId)),
  });
  if (!session) throw new AppError("NOT_FOUND");
  return session;
}

/** Stellt sicher, dass die Workout-Übung dem Nutzer gehört. */
export async function getOwnedWorkoutExercise(db: AppDatabase, userId: string, workoutExerciseId: string) {
  const row = await db.query.workoutExercise.findFirst({
    where: and(eq(workoutExercise.id, workoutExerciseId), eq(workoutExercise.userId, userId)),
  });
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}
