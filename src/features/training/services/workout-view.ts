/**
 * Baut die vollständige Ansicht eines Workouts für den Trainingsmodus und den Verlauf.
 */
import { asc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { workoutExercise, workoutSet } from "@/db/schema";
import type { ExerciseType } from "@/domain/exercises/types";
import { defaultIncrementKg } from "@/domain/training/progression";
import type { ExerciseBests } from "@/domain/training/records";
import { DAY_FOCUSES, SET_TYPES, isOneOf, type DayFocus, type SetType } from "@/domain/training/types";
import type { LocalDate } from "@/lib/dates";
import { findExercise } from "../catalog";
import { getExerciseBests, getOwnedSession, getPreviousPerformances, type PreviousPerformance } from "./workout-queries";
import { getExerciseNotes } from "./workout-service";

export interface WorkoutSetView {
  id: string;
  position: number;
  type: SetType;
  targetWeightKg: number | null;
  targetReps: number | null;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
  note: string | null;
  completed: boolean;
  completedAt: string | null;
}

export interface WorkoutExerciseView {
  id: string;
  exerciseId: string;
  name: string;
  type: ExerciseType;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
  incrementKg: number;
  note: string;
  previous: PreviousPerformance | null;
  bests: ExerciseBests | null;
  sets: WorkoutSetView[];
}

export interface WorkoutView {
  id: string;
  status: "in_progress" | "completed";
  focus: DayFocus | null;
  date: LocalDate;
  isDeload: boolean;
  startedAt: string;
  finishedAt: string | null;
  note: string;
  exercises: WorkoutExerciseView[];
}

export async function getWorkoutView(db: AppDatabase, userId: string, sessionId: string): Promise<WorkoutView> {
  const session = await getOwnedSession(db, userId, sessionId);
  const exerciseRows = await db.query.workoutExercise.findMany({
    where: eq(workoutExercise.sessionId, sessionId),
    orderBy: asc(workoutExercise.position),
  });
  const exerciseIds = [...new Set(exerciseRows.map((row) => row.exerciseId))];
  const [setRows, previous, bests, notes] = await Promise.all([
    exerciseRows.length === 0
      ? Promise.resolve([])
      : db.query.workoutSet.findMany({
          where: inArray(
            workoutSet.workoutExerciseId,
            exerciseRows.map((row) => row.id),
          ),
          orderBy: asc(workoutSet.position),
        }),
    getPreviousPerformances(db, userId, exerciseIds, sessionId),
    getExerciseBests(db, userId, exerciseIds, sessionId),
    getExerciseNotes(db, userId, exerciseIds),
  ]);

  return {
    id: session.id,
    status: session.status === "completed" ? "completed" : "in_progress",
    focus: isOneOf(DAY_FOCUSES, session.focus) ? session.focus : null,
    date: session.date,
    isDeload: session.isDeload,
    startedAt: session.startedAt.toISOString(),
    finishedAt: session.finishedAt?.toISOString() ?? null,
    note: session.note ?? "",
    exercises: exerciseRows.flatMap((row): WorkoutExerciseView[] => {
      const exercise = findExercise(row.exerciseId);
      if (!exercise) return [];
      return [
        {
          id: row.id,
          exerciseId: row.exerciseId,
          name: exercise.name,
          type: exercise.type,
          repMin: row.repMin,
          repMax: row.repMax,
          targetRir: row.targetRir,
          restSeconds: row.restSeconds,
          incrementKg: defaultIncrementKg(exercise),
          note: notes.get(row.exerciseId) ?? "",
          previous: previous.get(row.exerciseId) ?? null,
          bests: bests.get(row.exerciseId) ?? null,
          sets: setRows
            .filter((set) => set.workoutExerciseId === row.id)
            .map((set) => ({
              id: set.id,
              position: set.position,
              type: isOneOf(SET_TYPES, set.type) ? set.type : "work",
              targetWeightKg: set.targetWeightKg,
              targetReps: set.targetReps,
              weightKg: set.weightKg,
              reps: set.reps,
              rir: set.rir,
              note: set.note,
              completed: set.completedAt !== null,
              completedAt: set.completedAt?.toISOString() ?? null,
            })),
        },
      ];
    }),
  };
}
