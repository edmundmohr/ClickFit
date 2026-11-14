/**
 * Datum für Gewicht und Wasser. Ohne Datum gilt „heute“ zum Zeitpunkt der Aktion (so bucht die
 * Heute-Seite nach Mitternacht nicht auf gestern); zukünftige Tage sind ausgeschlossen.
 */
import { isValidLocalDate, type LocalDate } from "@/lib/dates";

/** `null`, wenn das Datum ungültig ist oder in der Zukunft liegt. */
export function resolveTrackingDate(date: unknown, today: LocalDate): LocalDate | null {
  if (date === null || date === undefined) return today;
  if (typeof date !== "string" || !isValidLocalDate(date) || date > today) return null;
  return date;
}
