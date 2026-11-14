/**
 * Daten für die Auswertungen: Satzverlauf, Umfänge und manuelle Erholungswerte.
 */
import { and, asc, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { bodyMeasurement, recoveryOverride, workoutExercise, workoutSession, workoutSet } from "@/db/schema";
import { isMuscle, type Muscle } from "@/domain/exercises/types";
import type { RecoveryOverride } from "@/domain/progress/recovery";
import type { PeriodSession } from "@/domain/progress/reports";
import { MEASUREMENT_SITES, type MeasurementSite, type TrainedSet } from "@/domain/progress/types";
import { SET_TYPES, isOneOf } from "@/domain/training/types";
import type { LocalDate } from "@/lib/dates";

export interface SetHistoryFilter {
  from?: LocalDate;
  to?: LocalDate;
  exerciseId?: string;
}

/** Alle abgehakten Sätze aus abgeschlossenen Einheiten des Nutzers, optional eingegrenzt. */
export async function getTrainedSets(db: AppDatabase, userId: string, filter: SetHistoryFilter = {}): Promise<TrainedSet[]> {
  const rows = await db
    .select({
      exerciseId: workoutExercise.exerciseId,
      sessionId: workoutSession.id,
      date: workoutSession.date,
      completedAt: workoutSet.completedAt,
      type: workoutSet.type,
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
        eq(workoutSession.status, "completed"),
        isNotNull(workoutSet.completedAt),
        filter.exerciseId ? eq(workoutExercise.exerciseId, filter.exerciseId) : undefined,
        filter.from ? gte(workoutSession.date, filter.from) : undefined,
        filter.to ? lte(workoutSession.date, filter.to) : undefined,
      ),
    )
    .orderBy(asc(workoutSession.date), asc(workoutSet.position));
  return rows.flatMap((row) =>
    row.completedAt
      ? [{ ...row, completedAt: row.completedAt, type: isOneOf(SET_TYPES, row.type) ? row.type : "work" }]
      : [],
  );
}

export async function getPeriodSessions(db: AppDatabase, userId: string, from: LocalDate, to: LocalDate): Promise<PeriodSession[]> {
  const rows = await db.query.workoutSession.findMany({
    columns: { id: true, date: true, startedAt: true, finishedAt: true },
    where: and(
      eq(workoutSession.userId, userId),
      eq(workoutSession.status, "completed"),
      gte(workoutSession.date, from),
      lte(workoutSession.date, to),
    ),
    orderBy: asc(workoutSession.date),
  });
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    durationMinutes: row.finishedAt
      ? Math.max(1, Math.round((row.finishedAt.getTime() - row.startedAt.getTime()) / 60000))
      : null,
  }));
}

export interface MeasurementPoint {
  date: LocalDate;
  valueCm: number;
}

/** Trägt einen Umfang ein; ein zweiter Wert am selben Tag ersetzt den ersten. */
export async function saveMeasurement(
  db: AppDatabase,
  userId: string,
  input: { date: LocalDate; site: MeasurementSite; valueCm: number },
): Promise<void> {
  await db
    .insert(bodyMeasurement)
    .values({ userId, ...input, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [bodyMeasurement.userId, bodyMeasurement.site, bodyMeasurement.date],
      set: { valueCm: input.valueCm },
    });
}

export async function deleteMeasurement(db: AppDatabase, userId: string, site: MeasurementSite, date: LocalDate): Promise<void> {
  await db
    .delete(bodyMeasurement)
    .where(and(eq(bodyMeasurement.userId, userId), eq(bodyMeasurement.site, site), eq(bodyMeasurement.date, date)));
}

/** Alle Umfänge je Körperstelle, älteste zuerst. */
export async function getMeasurements(db: AppDatabase, userId: string): Promise<Record<MeasurementSite, MeasurementPoint[]>> {
  const rows = await db.query.bodyMeasurement.findMany({
    where: eq(bodyMeasurement.userId, userId),
    orderBy: [asc(bodyMeasurement.date), desc(bodyMeasurement.createdAt)],
  });
  const result: Record<MeasurementSite, MeasurementPoint[]> = {
    waist: [],
    chest: [],
    hips: [],
    upper_arm: [],
    forearm: [],
    thigh: [],
    calf: [],
    shoulders: [],
    neck: [],
  };
  for (const row of rows) {
    if (isOneOf(MEASUREMENT_SITES, row.site)) result[row.site].push({ date: row.date, valueCm: row.valueCm });
  }
  return result;
}

export async function getRecoveryOverrides(db: AppDatabase, userId: string): Promise<Partial<Record<Muscle, RecoveryOverride>>> {
  const rows = await db.query.recoveryOverride.findMany({ where: eq(recoveryOverride.userId, userId) });
  const result: Partial<Record<Muscle, RecoveryOverride>> = {};
  for (const row of rows) {
    if (isMuscle(row.muscle)) result[row.muscle] = { percent: row.percent, setAt: row.setAt };
  }
  return result;
}

/** Setzt den Erholungswert einer Muskelgruppe von Hand, gültig ab jetzt. */
export async function setRecoveryOverride(
  db: AppDatabase,
  userId: string,
  muscle: Muscle,
  percent: number,
  now = new Date(),
): Promise<void> {
  await db
    .insert(recoveryOverride)
    .values({ userId, muscle, percent, setAt: now })
    .onConflictDoUpdate({
      target: [recoveryOverride.userId, recoveryOverride.muscle],
      set: { percent, setAt: now },
    });
}
