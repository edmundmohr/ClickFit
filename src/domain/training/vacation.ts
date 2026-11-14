/**
 * Urlaubsmodus und Wiedereinstieg nach einer Pause.
 */
import { addDays, type LocalDate } from "@/lib/dates";

export const VACATION_TYPES = ["pause", "travel"] as const;
export type VacationType = (typeof VACATION_TYPES)[number];

export interface Vacation {
  type: VacationType;
  from: LocalDate;
  until: LocalDate;
  gymProfileId: string | null;
}

export function isVacationActive(vacation: Vacation | null | undefined, today: LocalDate): vacation is Vacation {
  return !!vacation && vacation.from <= today && today <= vacation.until;
}

/** Alle Tage eines Pausen-Urlaubs: Sie gelten für den Streak nicht als verpasst. */
export function pauseDates(vacation: Vacation | null | undefined): Set<LocalDate> {
  const dates = new Set<LocalDate>();
  if (!vacation || vacation.type !== "pause" || vacation.until < vacation.from) return dates;
  const MAX_DAYS = 366;
  for (let day = vacation.from, count = 0; day <= vacation.until && count < MAX_DAYS; day = addDays(day, 1), count++) {
    dates.add(day);
  }
  return dates;
}

/** Ab so vielen Tagen ohne Training gilt die nächste Einheit als Wiedereinstieg. */
export const REENTRY_AFTER_DAYS = 10;

/**
 * Faktor für die Zielgewichte beim Wiedereinstieg: nach längerer Pause leichter beginnen.
 * 1 = normal weitermachen.
 */
export function reentryFactor(daysSinceLastWorkout: number | null): number {
  if (daysSinceLastWorkout === null || daysSinceLastWorkout < REENTRY_AFTER_DAYS) return 1;
  if (daysSinceLastWorkout < 21) return 0.9;
  if (daysSinceLastWorkout < 42) return 0.85;
  return 0.75;
}
