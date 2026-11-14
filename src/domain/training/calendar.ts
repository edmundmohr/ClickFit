/**
 * Status eines Kalendertags aus Plan und erledigten Einheiten.
 */
import { weekdayOf, type LocalDate } from "@/lib/dates";
import type { Weekday } from "./types";

export type DayStatus = "done" | "planned" | "missed" | "rest";

export interface PlanSchedule {
  startDate: LocalDate;
  weekdays: readonly Weekday[];
}

/**
 * - done: An dem Tag wurde trainiert.
 * - planned: Trainingstag laut Plan, heute oder in der Zukunft.
 * - missed: Trainingstag laut Plan in der Vergangenheit ohne Training.
 * - rest: kein Trainingstag (oder vor dem Start des Plans).
 */
export function dayStatus(
  date: LocalDate,
  completedDates: ReadonlySet<LocalDate>,
  schedule: PlanSchedule | null,
  today: LocalDate,
): DayStatus {
  if (completedDates.has(date)) return "done";
  const isPlanned =
    schedule !== null && date >= schedule.startDate && schedule.weekdays.includes(weekdayOf(date));
  if (!isPlanned) return "rest";
  return date >= today ? "planned" : "missed";
}
