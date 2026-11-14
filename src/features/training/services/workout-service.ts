/**
 * Workouts starten, Sätze speichern, abschließen und verwerfen.
 */
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { exerciseNote, planExercise, workoutExercise, workoutSession, workoutSet } from "@/db/schema";
import { adaptDay, shortenDay } from "@/domain/training/adaptation";
import { cycleStatus } from "@/domain/training/cycle";
import { isDeloadWeek, nextSetTargets } from "@/domain/training/progression";
import type { ExerciseFeedback, PlannedExercise } from "@/domain/training/types";
import { reentryFactor } from "@/domain/training/vacation";
import { ladderFor, type WeightUnit } from "@/domain/training/weights";
import { AppError } from "@/lib/errors";
import { diffDays, toLocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import type { SaveSetInput } from "../schemas";
import { getTrainingContext, weightContext, withPlanGym, type TrainingContext } from "./context-service";
import { getUserCatalog } from "./exercise-service";
import { getOwnedDay } from "./plan-service";
import { getOwnedSession, getOwnedWorkoutExercise, getPreviousPerformances } from "./workout-queries";

/** D1 erlaubt höchstens 100 gebundene Parameter pro Anweisung. */
const SET_INSERT_CHUNK = 7;
const EXERCISE_INSERT_CHUNK = 9;

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

export interface StartOptions {
  /** Kurzvariante der Einheit (Zeitsparmodus). */
  short?: boolean;
  /** Einheit aus den Einstellungen des Nutzers; bestimmt die Gewichtsstufen ohne eigene Regeln. */
  defaultUnit?: WeightUnit;
}

interface SeedEntry {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
  groupId: string | null;
}

interface SessionSeed {
  planId: string | null;
  planDayId: string | null;
  focus: string | null;
  name: string | null;
  isShort: boolean;
  isDeload: boolean;
  entries: SeedEntry[];
}

const MAX_TARGET_RIR = 5;

/** Datum der letzten abgeschlossenen Einheit; `null`, wenn es noch keine gibt. */
async function getLastWorkoutDate(db: AppDatabase, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ date: max(workoutSession.date) })
    .from(workoutSession)
    .where(and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed")));
  return row?.date ?? null;
}

/**
 * Legt die Einheit mit Zielwerten für jeden Satz an. Berücksichtigt die Gewichtsstufen des
 * Trainingsorts, den Wiedereinstieg nach einer Pause und – falls aktiviert – die Zyklusphase.
 */
async function createSession(
  db: AppDatabase,
  userId: string,
  seed: SessionSeed,
  context: TrainingContext,
  now: Date,
  defaultUnit: WeightUnit,
): Promise<string> {
  const today = toLocalDate(now);
  const [previous, lastDate] = await Promise.all([
    getPreviousPerformances(
      db,
      userId,
      seed.entries.map((entry) => entry.exerciseId),
    ),
    getLastWorkoutDate(db, userId),
  ]);
  const weightFactor = reentryFactor(lastDate === null ? null : diffDays(lastDate, today));
  const cycle = context.settings.cycle?.enabled
    ? cycleStatus(context.settings.cycle.lastStart, context.settings.cycle.lengthDays, today)
    : null;
  const weights = weightContext(context, defaultUnit);

  const sessionId = newId();
  const exerciseRows: (typeof workoutExercise.$inferInsert)[] = [];
  const setRows: (typeof workoutSet.$inferInsert)[] = [];
  for (const entry of seed.entries) {
    const exercise = context.catalog.find(entry.exerciseId);
    // Gelöschte eigene Übungen bleiben im Verlauf, werden aber nicht mehr neu trainiert.
    if (!exercise || exercise.archived) continue;
    const workoutExerciseId = newId();
    const targetRir = Math.min(entry.targetRir + (cycle?.rirOffset ?? 0), MAX_TARGET_RIR);
    exerciseRows.push({
      id: workoutExerciseId,
      sessionId,
      userId,
      position: exerciseRows.length,
      exerciseId: entry.exerciseId,
      repMin: entry.repMin,
      repMax: entry.repMax,
      targetRir,
      restSeconds: entry.restSeconds,
      groupId: entry.groupId,
    });
    const ladder = ladderFor(exercise.equipment, weights);
    const targets = nextSetTargets({
      exerciseType: exercise.type,
      prescription: { ...entry, targetRir },
      previous: previous.get(entry.exerciseId)?.sets ?? [],
      incrementKg: ladder.incrementKg,
      steps: ladder,
      isDeload: seed.isDeload,
      hold: cycle?.holdProgression ?? false,
      weightFactor,
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

  try {
    await db.batch([
      db.insert(workoutSession).values({
        id: sessionId,
        userId,
        planId: seed.planId,
        planDayId: seed.planDayId,
        focus: seed.focus,
        name: seed.name,
        gymProfileId: context.gym?.id ?? null,
        isShort: seed.isShort,
        date: today,
        status: "in_progress",
        isDeload: seed.isDeload,
        startedAt: now,
        createdAt: now,
        updatedAt: now,
      }),
      ...chunk(exerciseRows, EXERCISE_INSERT_CHUNK).map((rows) => db.insert(workoutExercise).values(rows)),
      ...chunk(setRows, SET_INSERT_CHUNK).map((rows) => db.insert(workoutSet).values(rows)),
    ]);
  } catch (error) {
    // Zwei Starts gleichzeitig (z. B. Doppeltipp, zwei Geräte): Der Unique-Index lässt nur ein
    // offenes Workout zu. Der zweite Start setzt das bereits angelegte fort.
    if (!isOpenWorkoutConflict(error)) throw error;
    const running = await getInProgressSession(db, userId);
    if (!running) throw error;
    return running.id;
  }
  return sessionId;
}

/** Erkennt den Verstoß gegen den Index „höchstens ein offenes Workout pro Nutzer“ (auch verschachtelt). */
export function isOpenWorkoutConflict(error: unknown): boolean {
  for (let current: unknown = error, depth = 0; current instanceof Error && depth < 5; depth++) {
    if (/UNIQUE constraint failed: workout_session\.user_id/.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}

/**
 * Startet das Training eines Plantags bzw. einer Routine. Läuft bereits ein Training, wird
 * dieses fortgesetzt: Es gibt immer höchstens ein offenes Workout pro Nutzer.
 * Übungen, die heute nicht passen (Ort, Beschwerden, Ausschlüsse), werden ersetzt. Maßgeblich
 * ist der feste Ort des Plans, sonst der Ort des Tages.
 */
export async function startWorkout(
  db: AppDatabase,
  userId: string,
  planDayId: string,
  now = new Date(),
  options: StartOptions = {},
): Promise<string> {
  const running = await getInProgressSession(db, userId);
  if (running) return running.id;

  const { day, plan } = await getOwnedDay(db, userId, planDayId);
  const today = toLocalDate(now);
  const [planned, dayContext] = await Promise.all([
    db.query.planExercise.findMany({
      where: eq(planExercise.planDayId, planDayId),
      orderBy: asc(planExercise.position),
    }),
    getTrainingContext(db, userId, today),
  ]);
  // Hat der Plan einen festen Ort (z. B. „Draußen“), wird dort trainiert, nicht am Ort des Tages.
  const context = withPlanGym(dayContext, plan.gymProfileId);

  // Gelöschte eigene Übungen werden übersprungen (die Routine kann sie noch enthalten).
  const available = planned.filter((entry) => !context.catalog.find(entry.exerciseId)?.archived);
  const adapted = context.candidateProfile
    ? adaptDay(available, context.catalog.find, context.catalog.all, context.candidateProfile).items
    : available.flatMap((entry) => {
        const exercise = context.catalog.find(entry.exerciseId);
        return exercise ? [{ entry, exercise }] : [];
      });
  const entries = options.short ? shortenDay(adapted) : adapted.map((item) => item.entry);

  return createSession(
    db,
    userId,
    {
      planId: plan.id,
      planDayId,
      focus: day.focus,
      name: day.name,
      isShort: options.short ?? false,
      isDeload: isDeloadWeek(diffDays(plan.startDate, today), plan.deloadEveryWeeks),
      entries,
    },
    context,
    now,
    options.defaultUnit ?? "kg",
  );
}

/**
 * Startet ein Training ohne Plantag aus fertig zusammengestellten Übungen
 * (erholungsorientierter Modus).
 */
export async function startFreeWorkout(
  db: AppDatabase,
  userId: string,
  name: string,
  entries: PlannedExercise[],
  now = new Date(),
  options: StartOptions = {},
): Promise<string> {
  const running = await getInProgressSession(db, userId);
  if (running) return running.id;
  const context = await getTrainingContext(db, userId, toLocalDate(now));
  return createSession(
    db,
    userId,
    {
      planId: null,
      planDayId: null,
      focus: null,
      name,
      isShort: false,
      isDeload: false,
      entries: entries.map((entry) => ({ ...entry, groupId: null })),
    },
    context,
    now,
    options.defaultUnit ?? "kg",
  );
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

/** Speichert die Abfrage nach einer Übung (Anstrengung und RIR); auch nachträglich möglich. */
export async function saveExerciseFeedback(
  db: AppDatabase,
  userId: string,
  workoutExerciseId: string,
  feedback: ExerciseFeedback,
): Promise<void> {
  await getOwnedWorkoutExercise(db, userId, workoutExerciseId);
  await db
    .update(workoutExercise)
    .set({ effort: feedback.effort, effortRir: feedback.rir })
    .where(eq(workoutExercise.id, workoutExerciseId));
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
  if (!(await getUserCatalog(db, userId)).find(exerciseId)) throw new AppError("NOT_FOUND");
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
