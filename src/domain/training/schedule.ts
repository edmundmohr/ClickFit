/**
 * Streaks, Zeitschätzung im Training und Umgang mit vergessenen Workouts.
 */
import { addDays, weekdayOf, type LocalDate } from "@/lib/dates";
import { SET_WORK_SECONDS } from "./plan-generator/prescription";
import type { Weekday } from "./types";

const MAX_STREAK_LOOKBACK_DAYS = 730;

/**
 * Trainings-Streak in absolvierten Trainingstagen.
 * Ruhetage unterbrechen den Streak nicht. Ein verpasster geplanter Tag beendet ihn;
 * der heutige Tag zählt erst als verpasst, wenn er vorbei ist.
 * Ohne geplante Wochentage zählt jeder Tag ohne Training als Unterbrechung.
 */
export function trainingStreak(
  completedDates: ReadonlySet<LocalDate>,
  plannedWeekdays: readonly Weekday[],
  today: LocalDate,
  /** Tage, die nicht als verpasst zählen (Urlaubsmodus „Pause“). */
  excusedDates: ReadonlySet<LocalDate> = new Set(),
): number {
  let streak = 0;
  for (let offset = 0; offset < MAX_STREAK_LOOKBACK_DAYS; offset++) {
    const day = addDays(today, -offset);
    if (completedDates.has(day)) {
      streak++;
      continue;
    }
    const isToday = offset === 0;
    const isPlanned = plannedWeekdays.length === 0 || plannedWeekdays.includes(weekdayOf(day));
    if (isPlanned && !isToday && !excusedDates.has(day)) break;
  }
  return streak;
}

export interface RemainingSet {
  completed: boolean;
  restSeconds: number;
}

/** Voraussichtlich verbleibende Zeit: offene Sätze samt Pausen. */
export function estimateRemainingSeconds(sets: readonly RemainingSet[]): number {
  return sets
    .filter((set) => !set.completed)
    .reduce((total, set) => total + SET_WORK_SECONDS + set.restSeconds, 0);
}

export const FORGOTTEN_WORKOUT_AFTER_MS = 3 * 60 * 60 * 1000;
const WRAP_UP_AFTER_LAST_SET_MS = 2 * 60 * 1000;
const FALLBACK_DURATION_MS = 60 * 60 * 1000;

export function isWorkoutForgotten(startedAt: Date, now: Date): boolean {
  return now.getTime() - startedAt.getTime() > FORGOTTEN_WORKOUT_AFTER_MS;
}

/**
 * Realistisches Ende für ein vergessenes Workout: kurz nach dem letzten abgehakten Satz,
 * sonst eine Stunde nach dem Start.
 */
export function suggestFinishTime(startedAt: Date, lastSetCompletedAt: Date | null): Date {
  if (lastSetCompletedAt && lastSetCompletedAt.getTime() > startedAt.getTime()) {
    return new Date(lastSetCompletedAt.getTime() + WRAP_UP_AFTER_LAST_SET_MS);
  }
  return new Date(startedAt.getTime() + FALLBACK_DURATION_MS);
}
