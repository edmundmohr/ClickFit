/**
 * Lädt alle gespeicherten Daten einer Person für die KI und verdichtet sie zu einem
 * `AiDataSnapshot`. Name und Benutzername werden nicht geladen.
 */
import { and, count, desc, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import {
  bodyFatEstimate,
  exerciseNote,
  foodLogEntry,
  progressPhoto,
  supplement,
  supplementLog,
  waterLog,
  workoutExercise,
  workoutSession,
  workoutSet,
} from "@/db/schema";
import { MOBILITY_ROUTINES_BY_ID } from "@/data/mobility";
import {
  AI_LOOKBACK_DAYS,
  AI_MAX_ACTIVITIES,
  AI_MAX_EXERCISES,
  AI_MAX_NOTES,
  AI_MAX_SESSIONS,
  AI_WEIGHT_LOOKBACK_DAYS,
  type AiDataSnapshot,
  type AiNutritionData,
  type AiTrainingData,
} from "@/domain/ai/data-context";
import { exerciseProgress, weeklySetsPerMuscle, weeklySummaries, type DatedValue } from "@/domain/ai/data-summary";
import { weightTrend } from "@/domain/nutrition/adaptive";
import { ageFromBirthYear } from "@/domain/nutrition/energy";
import { MEASUREMENT_SITES } from "@/domain/progress/types";
import { cycleStatus } from "@/domain/training/cycle";
import { MUSCLES } from "@/domain/exercises/types";
import { listActivities } from "@/features/cardio/services/activity-service";
import { listCardioPlan } from "@/features/cardio/services/cardio-plan-service";
import { getHealthMetrics } from "@/features/integrations/services/import-service";
import { listLogs } from "@/features/mobility/services/mobility-service";
import { getCheckIn, getCurrentTarget } from "@/features/nutrition/services/target-service";
import { getWaterGoal, getWeights } from "@/features/nutrition/services/tracking-service";
import { getMeasurements, getTrainedSets } from "@/features/progress/services/progress-service";
import { getRecoverySnapshot } from "@/features/progress/services/recovery-service";
import { getUserCatalog } from "@/features/training/services/exercise-service";
import { listFolders } from "@/features/training/services/plan-service";
import { getProfile } from "@/features/training/services/profile-service";
import { getTrainingSettings } from "@/features/training/services/settings-service";
import { addDays, type LocalDate } from "@/lib/dates";

/** Für die Plateau-Erkennung reicht der Zeitraum nicht; sie braucht mindestens sechs Einheiten. */
const PLATEAU_HISTORY_DAYS = 120;

type Lookup = Awaited<ReturnType<typeof getUserCatalog>>["find"];

async function loadTraining(
  db: AppDatabase,
  userId: string,
  from: LocalDate,
  today: LocalDate,
  find: Lookup,
): Promise<AiTrainingData> {
  const [history, sessions, notes, setNotes, folders] = await Promise.all([
    getTrainedSets(db, userId, { from: addDays(today, -PLATEAU_HISTORY_DAYS), to: today }),
    db.query.workoutSession.findMany({
      columns: { date: true, name: true, startedAt: true, finishedAt: true, isDeload: true, isShort: true, note: true },
      where: and(eq(workoutSession.userId, userId), eq(workoutSession.status, "completed"), gte(workoutSession.date, from)),
      orderBy: desc(workoutSession.date),
      limit: AI_MAX_SESSIONS,
    }),
    db.query.exerciseNote.findMany({ where: eq(exerciseNote.userId, userId), orderBy: desc(exerciseNote.updatedAt) }),
    db
      .select({ date: workoutSession.date, exerciseId: workoutExercise.exerciseId, note: workoutSet.note })
      .from(workoutSet)
      .innerJoin(workoutExercise, eq(workoutSet.workoutExerciseId, workoutExercise.id))
      .innerJoin(workoutSession, eq(workoutExercise.sessionId, workoutSession.id))
      .where(and(eq(workoutExercise.userId, userId), gte(workoutSession.date, from), isNotNull(workoutSet.note)))
      .orderBy(desc(workoutSession.date))
      .limit(AI_MAX_NOTES),
    listFolders(db, userId),
  ]);
  const name = (exerciseId: string) => find(exerciseId)?.name ?? exerciseId;
  const recent = history.filter((set) => set.date >= from);
  const plan = folders.find((folder) => folder.status === "active");
  return {
    sessions: sessions.map((session) => ({
      date: session.date,
      name: session.name,
      durationMinutes: session.finishedAt
        ? Math.max(1, Math.round((session.finishedAt.getTime() - session.startedAt.getTime()) / 60000))
        : null,
      isDeload: session.isDeload,
      isShort: session.isShort,
      note: session.note?.trim() || null,
    })),
    exercises: exerciseProgress(recent, history, find, AI_MAX_EXERCISES),
    weeklySets: weeklySetsPerMuscle(recent, find, from, today),
    exerciseNotes: notes
      .filter((note) => note.note.trim() !== "")
      .slice(0, AI_MAX_NOTES)
      .map((note) => ({ date: null, exercise: name(note.exerciseId), note: note.note })),
    setNotes: setNotes.flatMap((row) =>
      row.note?.trim() ? [{ date: row.date, exercise: name(row.exerciseId), note: row.note }] : [],
    ),
    plan: (plan?.days ?? []).map((day, index) => ({
      name: day.name ?? day.focus ?? `Tag ${index + 1}`,
      weekday: day.weekday,
      exercises: day.exercises.map(
        (item) =>
          `${item.exercise.name} ${item.sets}×${item.repMin}-${item.repMax}` +
          (item.targetWeightKg === null ? "" : `, eigenes Zielgewicht ${item.targetWeightKg} kg`),
      ),
    })),
  };
}

async function loadNutrition(db: AppDatabase, userId: string, from: LocalDate, today: LocalDate): Promise<AiNutritionData> {
  const [target, checkIn, days, water, waterGoalMl, supplements] = await Promise.all([
    getCurrentTarget(db, userId, today),
    getCheckIn(db, userId, today),
    db
      .select({
        date: foodLogEntry.date,
        kcal: sql<number>`sum(${foodLogEntry.kcal})`,
        proteinG: sql<number>`sum(${foodLogEntry.proteinG})`,
        carbsG: sql<number>`sum(${foodLogEntry.carbsG})`,
        fatG: sql<number>`sum(${foodLogEntry.fatG})`,
      })
      .from(foodLogEntry)
      .where(and(eq(foodLogEntry.userId, userId), gte(foodLogEntry.date, from), lte(foodLogEntry.date, today)))
      .groupBy(foodLogEntry.date),
    db
      .select({ date: waterLog.date, value: sql<number>`sum(${waterLog.amountMl})` })
      .from(waterLog)
      .where(and(eq(waterLog.userId, userId), gte(waterLog.date, from), lte(waterLog.date, today)))
      .groupBy(waterLog.date),
    getWaterGoal(db, userId),
    db
      .select({ name: supplement.name, dose: supplement.dose, takenDays: count(supplementLog.date) })
      .from(supplement)
      .leftJoin(
        supplementLog,
        and(eq(supplementLog.supplementId, supplement.id), gte(supplementLog.date, from), lte(supplementLog.date, today)),
      )
      .where(eq(supplement.userId, userId))
      .groupBy(supplement.id),
  ]);
  const series = (pick: (day: (typeof days)[number]) => number): DatedValue[] =>
    days.map((day) => ({ date: day.date, value: pick(day) }));
  const confident = checkIn && checkIn.analysis.confidence > 0 ? checkIn.analysis : null;
  return {
    target: target
      ? { kcal: target.kcal, proteinG: target.proteinG, carbsG: target.carbsG, fatG: target.fatG, source: target.source }
      : null,
    adaptive: confident ? { tdeeKcal: confident.tdeeKcal, confidence: confident.confidence } : null,
    kcal: weeklySummaries(series((day) => day.kcal), from, today),
    proteinG: weeklySummaries(series((day) => day.proteinG), from, today),
    carbsG: weeklySummaries(series((day) => day.carbsG), from, today),
    fatG: weeklySummaries(series((day) => day.fatG), from, today),
    waterMl: weeklySummaries(water, from, today),
    waterGoalMl,
    supplements,
  };
}

/** Alle Daten der Person für die KI. `now` bestimmt den Erholungsstand. */
export async function loadAiSnapshot(
  db: AppDatabase,
  userId: string,
  today: LocalDate,
  now = new Date(),
): Promise<AiDataSnapshot> {
  const from = addDays(today, -(AI_LOOKBACK_DAYS - 1));
  const catalog = await getUserCatalog(db, userId);
  const [stored, settings, training, recovery, nutrition, weights, measurements, bodyFat, [photos], activities, planned, mobility, steps, restingHeartRate] =
    await Promise.all([
      getProfile(db, userId),
      getTrainingSettings(db, userId),
      loadTraining(db, userId, from, today, catalog.find),
      getRecoverySnapshot(db, userId, catalog.find, now),
      loadNutrition(db, userId, from, today),
      getWeights(db, userId, addDays(today, -(AI_WEIGHT_LOOKBACK_DAYS - 1)), today),
      getMeasurements(db, userId),
      db.query.bodyFatEstimate.findMany({
        columns: { date: true, lowPercent: true, highPercent: true },
        where: eq(bodyFatEstimate.userId, userId),
        orderBy: desc(bodyFatEstimate.date),
      }),
      db.select({ value: count() }).from(progressPhoto).where(eq(progressPhoto.userId, userId)),
      listActivities(db, userId, from, today),
      listCardioPlan(db, userId),
      listLogs(db, userId, from, today),
      getHealthMetrics(db, userId, "steps", from, today),
      getHealthMetrics(db, userId, "resting_heart_rate", from, today),
    ]);
  const profile = stored?.profile ?? null;
  const cycle = settings.cycle?.enabled ? cycleStatus(settings.cycle.lastStart, settings.cycle.lengthDays, today) : null;
  const name = (exerciseId: string) => catalog.find(exerciseId)?.name ?? exerciseId;

  return {
    today,
    from,
    profile: profile
      ? {
          sex: profile.sex,
          ageYears: ageFromBirthYear(profile.birthYear, Number(today.slice(0, 4))),
          heightCm: profile.heightCm,
          goal: profile.goal,
          experience: profile.experience,
          activityLevel: profile.activityLevel,
          trainingWeekdays: profile.weekdays.length,
          sessionMinutes: profile.sessionMinutes,
          injuries: profile.injuries,
          injuryNote: profile.injuryNote?.trim() || null,
          cardioWish: profile.cardio,
          excludedExercises: profile.excludedExerciseIds.map(name),
        }
      : null,
    settings: {
      recoveryMode: settings.recoveryMode,
      gripModule: settings.gripModule,
      vacation: settings.vacation,
      cycle: cycle && settings.cycle ? { day: cycle.day, phase: cycle.phase, lengthDays: settings.cycle.lengthDays } : null,
      extraSports: settings.extraSports,
    },
    training,
    recovery: Object.fromEntries(MUSCLES.map((muscle) => [muscle, recovery[muscle]])),
    nutrition,
    body: {
      weights: weightTrend(weights),
      measurements: MEASUREMENT_SITES.flatMap((site) => {
        const points = measurements[site];
        const first = points.at(0);
        const last = points.at(-1);
        return first && last
          ? [{ site, first: { date: first.date, value: first.valueCm }, last: { date: last.date, value: last.valueCm } }]
          : [];
      }),
      bodyFat: bodyFat.map((item) => ({ date: item.date, lowPercent: item.lowPercent, highPercent: item.highPercent })),
      photos: photos?.value ?? 0,
    },
    cardio: {
      activities: activities.slice(0, AI_MAX_ACTIVITIES).map((item) => ({
        date: item.date,
        type: item.type,
        minutes: Math.round(item.durationSeconds / 60),
        distanceKm: item.distanceMeters === null ? null : item.distanceMeters / 1000,
        avgHeartRate: item.avgHeartRate,
        zone: item.zone,
        intensity: item.intensity,
        note: item.note?.trim() || null,
      })),
      planned: planned.map((item) => ({ weekday: item.weekday, type: item.type, minutes: item.minutes, zone: item.zone })),
    },
    mobility: mobility.map((item) => ({
      date: item.date,
      routine: MOBILITY_ROUTINES_BY_ID.get(item.routineId)?.name ?? item.routineId,
      minutes: Math.round(item.durationSeconds / 60),
    })),
    steps: weeklySummaries(steps, from, today),
    restingHeartRate: weeklySummaries(restingHeartRate, from, today),
  };
}
