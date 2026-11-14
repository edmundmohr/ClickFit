/**
 * Fokus-Training: eine Einheit für ausgewählte Körperregionen, unabhängig vom Wochenplan.
 */
import type { AppDatabase } from "@/db/client";
import type { Exercise } from "@/domain/exercises/types";
import {
  FOCUS_AREAS,
  areaReadiness,
  buildFocusDay,
  nearestFocusMinutes,
  type FocusArea,
  type FocusMinutes,
} from "@/domain/training/focus-day";
import { estimateSessionSeconds } from "@/domain/training/plan-generator/prescription";
import type { PlannedExercise } from "@/domain/training/types";
import { getRecoverySnapshot } from "@/features/progress/services/recovery-service";
import { toLocalDate } from "@/lib/dates";
import { getTrainingContext } from "./context-service";
import { getPreferences } from "./settings-service";

export interface FocusDayView {
  areas: FocusArea[];
  minutes: FocusMinutes;
  /** Dauer aus dem Profil, auf eine wählbare Stufe gerundet. */
  defaultMinutes: FocusMinutes;
  /** Durchschnittliche Erholung je Region in Prozent. */
  readiness: Record<FocusArea, number>;
  exercises: (PlannedExercise & { exercise: Exercise })[];
  estimatedMinutes: number;
}

/**
 * Stellt die Fokus-Einheit für die gewählten Regionen zusammen. Ohne `minutes` gilt die Dauer
 * aus dem Profil. `null`, solange es kein Profil gibt.
 */
export async function getFocusDay(
  db: AppDatabase,
  userId: string,
  areas: FocusArea[],
  minutes: FocusMinutes | null,
  now = new Date(),
): Promise<FocusDayView | null> {
  const today = toLocalDate(now);
  const context = await getTrainingContext(db, userId, today);
  if (!context.profile) return null;
  const [recovery, preferences] = await Promise.all([
    getRecoverySnapshot(db, userId, context.catalog.find, now),
    getPreferences(db, userId, today),
  ]);
  const defaultMinutes = nearestFocusMinutes(context.profile.sessionMinutes);
  const chosenMinutes = minutes ?? defaultMinutes;
  const planned = buildFocusDay(areas, context.profile, context.catalog.all, { minutes: chosenMinutes, preferences });
  const exercises = planned.flatMap((entry) => {
    const exercise = context.catalog.find(entry.exerciseId);
    return exercise ? [{ ...entry, exercise }] : [];
  });
  return {
    areas,
    minutes: chosenMinutes,
    defaultMinutes,
    readiness: Object.fromEntries(FOCUS_AREAS.map((area) => [area, areaReadiness(area, recovery)])) as Record<
      FocusArea,
      number
    >,
    exercises,
    estimatedMinutes: exercises.length > 0 ? Math.round(estimateSessionSeconds(exercises) / 60) : 0,
  };
}
