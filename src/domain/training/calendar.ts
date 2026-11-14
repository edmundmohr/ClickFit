/**
 * Status eines Kalendertags aus Plan und erledigten Einheiten.
 */
import { weekdayOf, type LocalDate } from "@/lib/dates";
import type { Weekday } from "./types";

export type DayStatus = "done" | "planned" | "missed" | "rest";

export interface PlanSchedule {
  startDate: LocalDate;
  weekdays: readonly Weekday[];
  /** Tage im Pausen-Urlaub: gelten als Ruhetage. */
  pausedDates?: ReadonlySet<LocalDate>;
}

/**
 * Mehrere Pläne (Haupt- und Zusatzpläne) werden als Liste übergeben: Ein Tag ist geplant, sobald
 * ihn einer der Pläne ab seinem Start vorsieht.
 * - done: An dem Tag wurde trainiert.
 * - planned: Trainingstag laut Plan, heute oder in der Zukunft.
 * - missed: Trainingstag laut Plan in der Vergangenheit ohne Training.
 * - rest: kein Trainingstag (oder vor dem Start des Plans).
 */
export function dayStatus(
  date: LocalDate,
  completedDates: ReadonlySet<LocalDate>,
  schedule: PlanSchedule | readonly PlanSchedule[] | null,
  today: LocalDate,
): DayStatus {
  if (completedDates.has(date)) return "done";
  const schedules: readonly PlanSchedule[] = schedule === null ? [] : "startDate" in schedule ? [schedule] : schedule;
  const isPlanned = schedules.some(
    (entry) =>
      date >= entry.startDate && entry.weekdays.includes(weekdayOf(date)) && !entry.pausedDates?.has(date),
  );
  if (!isPlanned) return "rest";
  return date >= today ? "planned" : "missed";
}
