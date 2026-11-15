/**
 * Startgewichte für einen neu erzeugten Plan. Übungen, die schon einmal trainiert wurden,
 * bekommen keins: Dort steigert die Progression anhand der letzten Leistung.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { bodyWeightEntry, workoutExercise, workoutSet } from "@/db/schema";
import type { Exercise } from "@/domain/exercises/types";
import { startWeightKg, type StartAthlete } from "@/domain/training/start-weight";
import type { TrainingProfile } from "@/domain/training/types";
import { SEXES, isOneOf } from "@/domain/training/types";
import { ladderFor, type WeightUnit } from "@/domain/training/weights";
import { listGyms, weightContextOf } from "./gym-service";
import type { ProfileWithLocation } from "./profile-service";

/** Übungen mit mindestens einem abgeschlossenen Satz. */
async function trainedExerciseIds(db: AppDatabase, userId: string): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ exerciseId: workoutExercise.exerciseId })
    .from(workoutExercise)
    .innerJoin(workoutSet, eq(workoutSet.workoutExerciseId, workoutExercise.id))
    .where(and(eq(workoutExercise.userId, userId), isNotNull(workoutSet.completedAt)));
  return new Set(rows.map((row) => row.exerciseId));
}

/** Zuletzt gewogenes Körpergewicht, sonst die Angabe aus dem Fragebogen. */
async function currentBodyWeight(db: AppDatabase, userId: string, fallbackKg: number): Promise<number> {
  const latest = await db.query.bodyWeightEntry.findFirst({
    where: eq(bodyWeightEntry.userId, userId),
    orderBy: desc(bodyWeightEntry.date),
  });
  return latest?.weightKg ?? fallbackKg;
}

export interface StartWeightRequest {
  exerciseId: string;
  repMax: number;
  targetRir: number;
}

/**
 * Startgewicht je Eintrag (gleiche Reihenfolge wie `entries`); `null`, wenn die App keins vorgibt.
 * Gerundet wird auf die Gewichtsstufen des aktiven Trainingsorts.
 */
export async function planStartWeights(
  db: AppDatabase,
  userId: string,
  stored: ProfileWithLocation,
  training: TrainingProfile,
  entries: readonly StartWeightRequest[],
  findExercise: (exerciseId: string) => Exercise | null | undefined,
  defaultUnit: WeightUnit,
  now: Date,
): Promise<(number | null)[]> {
  const { profile } = stored;
  const [trained, bodyWeightKg, gyms] = await Promise.all([
    trainedExerciseIds(db, userId),
    currentBodyWeight(db, userId, profile.weightKg),
    listGyms(db, userId),
  ]);
  const athlete: StartAthlete = {
    sex: isOneOf(SEXES, profile.sex) ? profile.sex : "male",
    ageYears: now.getFullYear() - profile.birthYear,
    bodyWeightKg,
    experience: training.experience,
    goal: training.goal,
    injuries: training.injuries,
  };
  const weights = weightContextOf(gyms.find((gym) => gym.isActive) ?? null, defaultUnit);
  return entries.map((entry) => {
    const exercise = findExercise(entry.exerciseId);
    if (!exercise || trained.has(entry.exerciseId)) return null;
    return startWeightKg(exercise, athlete, entry, ladderFor(exercise.equipment, weights));
  });
}
