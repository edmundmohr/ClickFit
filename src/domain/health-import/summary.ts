/**
 * Kennzahlen für die Anzeige importierter Tageswerte.
 */
import { addDays, type LocalDate } from "@/lib/dates";

export interface DailyValue {
  date: LocalDate;
  value: number;
}

/** Durchschnitt der Tage mit Wert im Zeitraum (beide Tage eingeschlossen); ohne Werte `null`. */
export function averageBetween(values: DailyValue[], from: LocalDate, to: LocalDate): number | null {
  const inRange = values.filter((entry) => entry.date >= from && entry.date <= to);
  if (inRange.length === 0) return null;
  return inRange.reduce((sum, entry) => sum + entry.value, 0) / inRange.length;
}

/** Jüngster Wert bis einschließlich `to`. */
export function latestValue(values: DailyValue[], to: LocalDate): DailyValue | null {
  return values.filter((entry) => entry.date <= to).reduce<DailyValue | null>((best, entry) => (!best || entry.date > best.date ? entry : best), null);
}

/** Eine Zeile je Tag der letzten `days` Tage bis `to`; Tage ohne Wert sind `null`. */
export function dailySeries(values: DailyValue[], to: LocalDate, days: number): { date: LocalDate; value: number | null }[] {
  const byDate = new Map(values.map((entry) => [entry.date, entry.value]));
  return Array.from({ length: days }, (_, index) => {
    const date = addDays(to, index - (days - 1));
    return { date, value: byDate.get(date) ?? null };
  });
}
