/**
 * Datumshilfen. Tage werden als lokales Datum `YYYY-MM-DD` (Zeitzone der App) geführt,
 * weil die Server in UTC laufen und „heute“ sonst um Mitternacht falsch wäre.
 */
import { TIME_ZONE } from "@/i18n/config";
import type { Weekday } from "@/domain/training/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type LocalDate = string;

/** Lokales Datum (YYYY-MM-DD) eines Zeitpunkts in der Zeitzone der App. */
export function toLocalDate(instant: Date, timeZone: string = TIME_ZONE): LocalDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** Rechnet mit dem Datum als UTC-Mitternacht, damit Sommerzeit keine Rolle spielt. */
function toUtc(date: LocalDate): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function fromUtc(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

export function diffDays(from: LocalDate, to: LocalDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** ISO-Wochentag: 1 = Montag … 7 = Sonntag. */
export function weekdayOf(date: LocalDate): Weekday {
  const day = new Date(toUtc(date)).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, 1 - weekdayOf(date));
}

export function isValidLocalDate(value: string): value is LocalDate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && fromUtc(toUtc(value)) === value;
}

export interface CalendarMonth {
  year: number;
  /** 1–12 */
  month: number;
  /** Wochen von Montag bis Sonntag; Tage außerhalb des Monats sind `null`. */
  weeks: (LocalDate | null)[][];
}

export function buildCalendarMonth(year: number, month: number): CalendarMonth {
  const first = fromUtc(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (LocalDate | null)[] = Array.from({ length: weekdayOf(first) - 1 }, () => null);
  for (let day = 0; day < daysInMonth; day++) cells.push(addDays(first, day));
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (LocalDate | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));
  return { year, month, weeks };
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}
