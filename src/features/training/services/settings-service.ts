/**
 * Trainingsanpassungen: Modi (Urlaub, Erholung, Griffkraft, Zyklus), Zusatzsport,
 * Beschwerden und ausgeschlossene Übungen sowie das, was der Generator gelernt hat.
 */
import { and, eq, gte, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { exercisePreference, trainingSettings, userProfile, workoutExercise, workoutSession } from "@/db/schema";
import { isActivityType, type ActivityType } from "@/domain/cardio/types";
import type { ExercisePreference } from "@/domain/training/plan-generator";
import type { BodyRegion } from "@/domain/training/types";
import { VACATION_TYPES, type Vacation } from "@/domain/training/vacation";
import { isOneOf } from "@/domain/training/types";
import { addDays, isValidLocalDate, type LocalDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";

export interface CycleSettings {
  enabled: boolean;
  lastStart: LocalDate;
  lengthDays: number;
}

export interface ExtraSport {
  type: ActivityType;
  sessionsPerWeek: number;
}

export interface TrainingSettings {
  recoveryMode: boolean;
  gripModule: boolean;
  vacation: Vacation | null;
  cycle: CycleSettings | null;
  extraSports: ExtraSport[];
}

export const DEFAULT_SETTINGS: TrainingSettings = {
  recoveryMode: false,
  gripModule: false,
  vacation: null,
  cycle: null,
  extraSports: [],
};

export async function getTrainingSettings(db: AppDatabase, userId: string): Promise<TrainingSettings> {
  const row = await db.query.trainingSettings.findFirst({ where: eq(trainingSettings.userId, userId) });
  if (!row) return DEFAULT_SETTINGS;
  const vacation = row.vacation;
  const cycle = row.cycle;
  return {
    recoveryMode: row.recoveryMode,
    gripModule: row.gripModule,
    vacation:
      vacation && isOneOf(VACATION_TYPES, vacation.type) && isValidLocalDate(vacation.from) && isValidLocalDate(vacation.until)
        ? { type: vacation.type, from: vacation.from, until: vacation.until, gymProfileId: vacation.gymProfileId }
        : null,
    cycle: cycle && isValidLocalDate(cycle.lastStart) ? cycle : null,
    extraSports: (row.extraSports ?? []).flatMap((sport): ExtraSport[] =>
      isActivityType(sport.type) ? [{ type: sport.type, sessionsPerWeek: sport.sessionsPerWeek }] : [],
    ),
  };
}

export async function saveTrainingSettings(
  db: AppDatabase,
  userId: string,
  patch: Partial<TrainingSettings>,
  now = new Date(),
): Promise<void> {
  const current = await getTrainingSettings(db, userId);
  const values = { ...current, ...patch, updatedAt: now };
  await db
    .insert(trainingSettings)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: trainingSettings.userId, set: values });
}

/** Verletztenmodus: Beschwerden direkt ändern, ohne den Fragebogen zu wiederholen. */
export async function saveInjuries(
  db: AppDatabase,
  userId: string,
  injuries: BodyRegion[],
  injuryNote: string,
  now = new Date(),
): Promise<void> {
  const updated = await db
    .update(userProfile)
    .set({ injuries, injuryNote: injuryNote.trim() || null, updatedAt: now })
    .where(eq(userProfile.userId, userId))
    .returning({ userId: userProfile.userId });
  if (updated.length === 0) throw new AppError("PROFILE_REQUIRED");
}

/** Schließt eine Übung aus bzw. lässt sie wieder zu. */
export async function setExerciseExcluded(
  db: AppDatabase,
  userId: string,
  exerciseId: string,
  excluded: boolean,
  now = new Date(),
): Promise<void> {
  const profile = await db.query.userProfile.findFirst({ where: eq(userProfile.userId, userId) });
  if (!profile) throw new AppError("PROFILE_REQUIRED");
  const ids = new Set(profile.excludedExerciseIds);
  if (excluded) ids.add(exerciseId);
  else ids.delete(exerciseId);
  await db
    .update(userProfile)
    .set({ excludedExerciseIds: [...ids], updatedAt: now })
    .where(eq(userProfile.userId, userId));
}

export type RejectionKind = "swappedOut" | "removed";

/** Merkt sich, dass ein Vorschlag getauscht oder gelöscht wurde. */
export async function recordRejection(
  db: AppDatabase,
  userId: string,
  exerciseId: string,
  kind: RejectionKind,
  now = new Date(),
): Promise<void> {
  await db
    .insert(exercisePreference)
    .values({ userId, exerciseId, swappedOut: kind === "swappedOut" ? 1 : 0, removed: kind === "removed" ? 1 : 0, updatedAt: now })
    .onConflictDoUpdate({
      target: [exercisePreference.userId, exercisePreference.exerciseId],
      set:
        kind === "swappedOut"
          ? { swappedOut: sql`${exercisePreference.swappedOut} + 1`, updatedAt: now }
          : { removed: sql`${exercisePreference.removed} + 1`, updatedAt: now },
    });
}

/** Wie weit der lernende Generator zurückschaut. */
export const PREFERENCE_LOOKBACK_DAYS = 90;

/** Gelernte Vorlieben: Nutzung aus dem Verlauf, Ablehnungen aus Tauschen und Löschen. */
export async function getPreferences(
  db: AppDatabase,
  userId: string,
  today: LocalDate,
): Promise<Map<string, ExercisePreference>> {
  const [usage, rejections] = await Promise.all([
    db
      .select({
        exerciseId: workoutExercise.exerciseId,
        sessions: sql<number>`count(distinct ${workoutExercise.sessionId})`,
      })
      .from(workoutExercise)
      .innerJoin(workoutSession, eq(workoutExercise.sessionId, workoutSession.id))
      .where(
        and(
          eq(workoutExercise.userId, userId),
          eq(workoutSession.status, "completed"),
          gte(workoutSession.date, addDays(today, -PREFERENCE_LOOKBACK_DAYS)),
        ),
      )
      .groupBy(workoutExercise.exerciseId),
    db.query.exercisePreference.findMany({ where: eq(exercisePreference.userId, userId) }),
  ]);
  const result = new Map<string, ExercisePreference>();
  for (const row of usage) result.set(row.exerciseId, { usage: Number(row.sessions), rejections: 0 });
  for (const row of rejections) {
    const entry = result.get(row.exerciseId) ?? { usage: 0, rejections: 0 };
    entry.rejections = row.swappedOut + row.removed;
    result.set(row.exerciseId, entry);
  }
  return result;
}
