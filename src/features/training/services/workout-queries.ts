/**
 * Lesende Abfragen rund um Workouts: letzte Leistung, bisherige Bestwerte, Besitzprüfung.
 */
import { and, asc, desc, eq, inArray, isNotNull, lt, ne, or, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { workoutExercise, workoutSession, workoutSet } from "@/db/schema";
import type { ExerciseType } from "@/domain/exercises/types";
import { withExerciseRir, type PerformedSet } from "@/domain/training/progression";
import { bestsOf, type ExerciseBests, type LoggedSet } from "@/domain/training/records";
import { SET_TYPES, isOneOf } from "@/domain/training/types";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";

export interface PreviousPerformance {
  date: LocalDate;
  /** Start der Einheit; entscheidet, ob ein später geändertes Zielgewicht noch gilt. */
  startedAt: Date;
  sets: PerformedSet[];
}

/** Eine Einheit als Bezugspunkt: Es zählen nur Einheiten, die vor ihr stattfanden. */
export interface SessionAnchor {
  id: string;
  date: LocalDate;
  startedAt: Date;
}

/** Einheiten vor dem Bezugspunkt (früheres Datum oder am selben Tag früher gestartet), ohne ihn selbst. */
function before(anchor: SessionAnchor | undefined): SQL | undefined {
  if (!anchor) return undefined;
  return and(
    ne(workoutSession.id, anchor.id),
    or(
      lt(workoutSession.date, anchor.date),
      and(eq(workoutSession.date, anchor.date), lt(workoutSession.startedAt, anchor.startedAt)),
    ),
  );
}

export interface PreviousOptions {
  /** Nur Einheiten vor dieser (Verlaufsansicht eines älteren Trainings). */
  before?: SessionAnchor;
  /**
   * Deload-Einheiten mitzählen. Für die Anzeige „Letztes Mal“ ja (es war die letzte Einheit),
   * als Basis der Progression nicht – sonst ginge es nach jeder Deload-Woche leichter weiter.
   */
  includeDeload?: boolean;
}

/**
 * Arbeitssätze der letzten abgeschlossenen Einheit je Übung (ohne Aufwärmsätze).
 * Standard ist die Basis der Progression: ohne Deload-Wochen.
 */
export async function getPreviousPerformances(
  db: AppDatabase,
  userId: string,
  exerciseIds: string[],
  options: PreviousOptions = {},
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
      exerciseRir: workoutExercise.effortRir,
    })
    .from(workoutSet)
    .innerJoin(workoutExercise, eq(workoutSet.workoutExerciseId, workoutExercise.id))
    .innerJoin(workoutSession, eq(workoutExercise.sessionId, workoutSession.id))
    .where(
      and(
        eq(workoutExercise.userId, userId),
        inArray(workoutExercise.exerciseId, exerciseIds),
        eq(workoutSession.status, "completed"),
        options.includeDeload ? undefined : eq(workoutSession.isDeload, false),
        isNotNull(workoutSet.completedAt),
        ne(workoutSet.type, "warmup"),
        before(options.before),
      ),
    )
    .orderBy(desc(workoutSession.date), desc(workoutSession.startedAt), asc(workoutSet.position));

  // Die Zeilen sind nach Datum absteigend sortiert: Pro Übung zählt nur die erste Einheit.
  const sessionByExercise = new Map<string, string>();
  const exerciseRirs = new Map<string, number | null>();
  for (const row of rows) {
    const chosen = sessionByExercise.get(row.exerciseId);
    if (chosen === undefined) {
      sessionByExercise.set(row.exerciseId, row.sessionId);
      result.set(row.exerciseId, { date: row.date, startedAt: row.startedAt, sets: [] });
      exerciseRirs.set(row.exerciseId, row.exerciseRir);
    } else if (chosen !== row.sessionId) {
      continue;
    }
    result.get(row.exerciseId)?.sets.push({ weightKg: row.weightKg, reps: row.reps, rir: row.rir });
  }
  // Der RIR aus der Abfrage nach der Übung ergänzt den letzten Satz, wenn dort keiner steht.
  for (const [exerciseId, performance] of result) {
    performance.sets = withExerciseRir(performance.sets, exerciseRirs.get(exerciseId) ?? null);
  }
  return result;
}

/**
 * Bestwerte je Übung aus allen abgeschlossenen Einheiten vor `anchor`. Fehlt eine Übung, gibt es
 * keine Historie. `typeOf` liefert die Übungsart (unterstützte Übungen werden umgekehrt gewertet).
 */
export async function getExerciseBests(
  db: AppDatabase,
  userId: string,
  exerciseIds: string[],
  anchor: SessionAnchor,
  typeOf: (exerciseId: string) => ExerciseType | undefined,
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
        before(anchor),
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
  for (const [exerciseId, sets] of grouped) result.set(exerciseId, bestsOf(sets, typeOf(exerciseId)));
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
