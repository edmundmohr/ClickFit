/**
 * Workouts starten, Sätze speichern, abschließen und verwerfen.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { exerciseNote, planDay, planExercise, trainingPlan, workoutExercise, workoutSession, workoutSet } from "@/db/schema";
import { defaultIncrementKg, isDeloadWeek, nextSetTargets } from "@/domain/training/progression";
import { AppError } from "@/lib/errors";
import { diffDays, toLocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { findExercise } from "../catalog";
import type { SaveSetInput } from "../schemas";
import { getOwnedSession, getOwnedWorkoutExercise, getPreviousPerformances } from "./workout-queries";

/** D1 erlaubt höchstens 100 gebundene Parameter pro Anweisung. */
const SET_INSERT_CHUNK = 7;
const EXERCISE_INSERT_CHUNK = 10;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export async function getInProgressSession(db: AppDatabase, userId: string) {
  const session = await db.query.workoutSession.findFirst({
    where: and(eq(workoutSession.userId, userId), eq(workoutSession.status, "in_progress")),
    orderBy: desc(workoutSession.startedAt),
  });
  return session ?? null;
}

/**
 * Startet das Training eines Plantags. Läuft bereits ein Training, wird dieses fortgesetzt:
 * Es gibt immer höchstens ein offenes Workout pro Nutzer.
 */
export async function startWorkout(
  db: AppDatabase,
  userId: string,
  planDayId: string,
  now = new Date(),
): Promise<string> {
  const running = await getInProgressSession(db, userId);
  if (running) return running.id;

  const [day] = await db
    .select({ day: planDay, plan: trainingPlan })
    .from(planDay)
    .innerJoin(trainingPlan, eq(planDay.planId, trainingPlan.id))
    .where(and(eq(planDay.id, planDayId), eq(trainingPlan.userId, userId)));
  if (!day) throw new AppError("NOT_FOUND");

  const planned = await db.query.planExercise.findMany({
    where: eq(planExercise.planDayId, planDayId),
    orderBy: asc(planExercise.position),
  });
  const today = toLocalDate(now);
  const isDeload = isDeloadWeek(diffDays(day.plan.startDate, today), day.plan.deloadEveryWeeks);
  const previous = await getPreviousPerformances(
    db,
    userId,
    planned.map((row) => row.exerciseId),
  );

  const sessionId = newId();
  const exerciseRows: (typeof workoutExercise.$inferInsert)[] = [];
  const setRows: (typeof workoutSet.$inferInsert)[] = [];
  for (const row of planned) {
    const exercise = findExercise(row.exerciseId);
    if (!exercise) continue;
    const workoutExerciseId = newId();
    exerciseRows.push({
      id: workoutExerciseId,
      sessionId,
      userId,
      position: exerciseRows.length,
      exerciseId: row.exerciseId,
      repMin: row.repMin,
      repMax: row.repMax,
      targetRir: row.targetRir,
      restSeconds: row.restSeconds,
    });
    const targets = nextSetTargets({
      exerciseType: exercise.type,
      prescription: row,
      previous: previous.get(row.exerciseId)?.sets ?? [],
      incrementKg: defaultIncrementKg(exercise),
      isDeload,
    });
    targets.forEach((target, position) =>
      setRows.push({
        id: newId(),
        workoutExerciseId,
        position,
        type: "work",
        targetWeightKg: target.weightKg,
        targetReps: target.reps,
      }),
    );
  }
  if (exerciseRows.length === 0) throw new AppError("PLAN_EMPTY");

  await db.batch([
    db.insert(workoutSession).values({
      id: sessionId,
      userId,
      planId: day.plan.id,
      planDayId,
      focus: day.day.focus,
      date: today,
      status: "in_progress",
      isDeload,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
    }),
    ...chunk(exerciseRows, EXERCISE_INSERT_CHUNK).map((rows) => db.insert(workoutExercise).values(rows)),
    ...chunk(setRows, SET_INSERT_CHUNK).map((rows) => db.insert(workoutSet).values(rows)),
  ]);
  return sessionId;
}

/**
 * Speichert einen Satz (neu oder geändert). Die Kennung kommt vom Client,
 * damit neue Sätze sofort und später auch offline angelegt werden können.
 */
export async function saveSet(
  db: AppDatabase,
  userId: string,
  input: SaveSetInput,
  now = new Date(),
): Promise<void> {
  await getOwnedWorkoutExercise(db, userId, input.workoutExerciseId);
  const existing = await db.query.workoutSet.findFirst({ where: eq(workoutSet.id, input.id) });
  if (existing && existing.workoutExerciseId !== input.workoutExerciseId) throw new AppError("NOT_FOUND");

  const values = {
    position: input.position,
    type: input.type,
    weightKg: input.weightKg,
    reps: input.reps,
    rir: input.rir,
    note: input.note || null,
    // Der Zeitpunkt des ersten Abhakens bleibt erhalten, wenn der Satz später nur korrigiert wird.
    completedAt: input.completed ? (existing?.completedAt ?? now) : null,
  };
  if (existing) {
    await db.update(workoutSet).set(values).where(eq(workoutSet.id, input.id));
  } else {
    await db.insert(workoutSet).values({ id: input.id, workoutExerciseId: input.workoutExerciseId, ...values });
  }
}

export async function deleteSet(db: AppDatabase, userId: string, setId: string): Promise<void> {
  const existing = await db.query.workoutSet.findFirst({ where: eq(workoutSet.id, setId) });
  if (!existing) return;
  await getOwnedWorkoutExercise(db, userId, existing.workoutExerciseId);
  await db.delete(workoutSet).where(eq(workoutSet.id, setId));
}

export async function finishWorkout(
  db: AppDatabase,
  userId: string,
  sessionId: string,
  finishedAt = new Date(),
): Promise<void> {
  const session = await getOwnedSession(db, userId, sessionId);
  if (session.status !== "in_progress") return;
  // Ein Ende vor dem Start wäre unsinnig (z. B. bei verstellter Uhr): dann gilt der Start.
  const end = finishedAt.getTime() < session.startedAt.getTime() ? session.startedAt : finishedAt;
  await db
    .update(workoutSession)
    .set({ status: "completed", finishedAt: end, updatedAt: new Date() })
    .where(eq(workoutSession.id, sessionId));
}

/** Löscht ein Workout samt Sätzen (laufend: verwerfen, abgeschlossen: aus dem Verlauf entfernen). */
export async function deleteWorkout(db: AppDatabase, userId: string, sessionId: string): Promise<void> {
  await getOwnedSession(db, userId, sessionId);
  await db.delete(workoutSession).where(eq(workoutSession.id, sessionId));
}

export async function saveSessionNote(
  db: AppDatabase,
  userId: string,
  sessionId: string,
  note: string,
): Promise<void> {
  await getOwnedSession(db, userId, sessionId);
  await db
    .update(workoutSession)
    .set({ note: note.trim() || null, updatedAt: new Date() })
    .where(eq(workoutSession.id, sessionId));
}

/** Dauerhafte Notiz zur Übung (z. B. Sitzeinstellung). Leerer Text löscht die Notiz. */
export async function saveExerciseNote(
  db: AppDatabase,
  userId: string,
  exerciseId: string,
  note: string,
): Promise<void> {
  if (!findExercise(exerciseId)) throw new AppError("NOT_FOUND");
  const text = note.trim();
  const where = and(eq(exerciseNote.userId, userId), eq(exerciseNote.exerciseId, exerciseId));
  if (!text) {
    await db.delete(exerciseNote).where(where);
    return;
  }
  const updatedAt = new Date();
  await db
    .insert(exerciseNote)
    .values({ userId, exerciseId, note: text, updatedAt })
    .onConflictDoUpdate({
      target: [exerciseNote.userId, exerciseNote.exerciseId],
      set: { note: text, updatedAt },
    });
}

export async function getExerciseNotes(
  db: AppDatabase,
  userId: string,
  exerciseIds: string[],
): Promise<Map<string, string>> {
  if (exerciseIds.length === 0) return new Map();
  const rows = await db.query.exerciseNote.findMany({
    where: and(eq(exerciseNote.userId, userId), inArray(exerciseNote.exerciseId, exerciseIds)),
  });
  return new Map(rows.map((row) => [row.exerciseId, row.note]));
}
