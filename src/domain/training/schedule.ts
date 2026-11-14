/**
 * Streaks, Zeitschätzung im Training und Umgang mit vergessenen Workouts.
 */
import { addDays, weekdayOf, type LocalDate } from "@/lib/dates";
import { EXERCISE_SETUP_SECONDS, SET_WORK_SECONDS } from "./plan-generator/prescription";
import { groupConsecutive, groupRestSeconds } from "./supersets";
import type { SetType, Weekday } from "./types";

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
  /** Satzart; Aufwärm- und Drop-Sätze folgen ohne volle Pause. */
  type?: SetType;
}

export interface RemainingExercise {
  /** Gleiche Kennung bei benachbarten Übungen = Supersatz bzw. Zirkel. */
  groupId: string | null;
  restSeconds: number;
  sets: readonly RemainingSet[];
}

/** Nach diesen Satzarten folgt keine volle Pause (Aufwärmen, direkt angehängter Drop-Satz). */
const NO_REST_TYPES: readonly SetType[] = ["warmup", "drop"];

/**
 * Voraussichtlich verbleibende Zeit, gerechnet wie `estimateDaySeconds`:
 * - jeder offene Satz dauert `SET_WORK_SECONDS`;
 * - Pausen nur zwischen den Durchgängen, nicht nach dem letzten Satz einer Übung;
 * - in Supersätzen und Zirkeln fällt die Pause einmal pro Durchgang an (die längste);
 * - Aufwärm- und Drop-Sätze bringen keine eigene Pause mit;
 * - zwischen zwei noch offenen Übungen bzw. Gruppen kommt die Wechselzeit dazu.
 */
export function estimateRemainingSeconds(exercises: readonly RemainingExercise[]): number {
  let total = 0;
  let openGroups = 0;
  for (const group of groupConsecutive(exercises)) {
    const open = group.items.map((item) => item.sets.filter((set) => !set.completed));
    const openSets = open.reduce((sum, sets) => sum + sets.length, 0);
    if (openSets === 0) continue;
    openGroups++;
    const rounds = Math.max(
      ...open.map((sets) => sets.filter((set) => !set.type || !NO_REST_TYPES.includes(set.type)).length),
    );
    const rest = groupRestSeconds(group.items.map((item) => item.restSeconds));
    total += openSets * SET_WORK_SECONDS + Math.max(rounds - 1, 0) * rest;
  }
  return total + Math.max(openGroups - 1, 0) * EXERCISE_SETUP_SECONDS;
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
