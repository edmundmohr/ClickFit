/**
 * Erholungsorientierter Modus: Vorschlag für das heutige Training aus den frischesten Muskelgruppen.
 */
import type { AppDatabase } from "@/db/client";
import type { Exercise, Muscle } from "@/domain/exercises/types";
import { buildRecoveryDay } from "@/domain/training/recovery-day";
import type { PlannedExercise } from "@/domain/training/types";
import { getRecoverySnapshot } from "@/features/progress/services/recovery-service";
import { toLocalDate } from "@/lib/dates";
import { getTrainingContext } from "./context-service";
import { getPreferences } from "./settings-service";

export interface RecoveryDayView {
  exercises: (PlannedExercise & { exercise: Exercise })[];
  focus: Muscle[];
  restRecommended: boolean;
}

/** `null`, solange es kein Profil gibt. */
export async function getRecoveryDay(db: AppDatabase, userId: string, now = new Date()): Promise<RecoveryDayView | null> {
  const today = toLocalDate(now);
  const context = await getTrainingContext(db, userId, today);
  if (!context.profile) return null;
  const [recovery, preferences] = await Promise.all([
    getRecoverySnapshot(db, userId, context.catalog.find, now),
    getPreferences(db, userId, today),
  ]);
  const day = buildRecoveryDay(recovery, context.profile, context.catalog.all, preferences);
  return {
    focus: day.focus,
    restRecommended: day.restRecommended,
    exercises: day.exercises.flatMap((entry) => {
      const exercise = context.catalog.find(entry.exerciseId);
      return exercise ? [{ ...entry, exercise }] : [];
    }),
  };
}
