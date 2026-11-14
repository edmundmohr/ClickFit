/** Mobility-Streak: aufeinanderfolgende Tage mit mindestens einer abgeschlossenen Routine. */
import { addDays, type LocalDate } from "@/lib/dates";

/** So weit reicht der Blick zurück; Dienste laden nur diesen Zeitraum. */
export const MOBILITY_STREAK_LOOKBACK_DAYS = 730;

/**
 * Zählt die Tage in Folge bis heute. Der heutige Tag zählt erst als Lücke, wenn er vorbei
 * ist: Ohne Routine heute läuft die Serie von gestern weiter.
 */
export function mobilityStreak(completedDates: Iterable<LocalDate>, today: LocalDate): number {
  const done = new Set(completedDates);
  let day = done.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (done.has(day) && streak < MOBILITY_STREAK_LOOKBACK_DAYS) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}
