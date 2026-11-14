/** Anzeige-Helfer ohne Texte: Zeiten und Zahlen im deutschen Format. */
import { LOCALE, TIME_ZONE } from "@/i18n/config";
import type { LocalDate } from "@/lib/dates";

/** Sekunden als m:ss (z. B. 150 → 2:30). */
export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Sekunden als h:mm:ss bzw. m:ss für die laufende Trainingsdauer. */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const rest = formatClock(seconds % 3600);
  return hours > 0 ? `${hours}:${rest.padStart(5, "0")}` : rest;
}

export function formatNumber(value: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
}

function localDateToUtcNoon(date: LocalDate): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** Lokales Datum als „Mo., 16.11.“ */
export function formatDayShort(date: LocalDate): string {
  return new Intl.DateTimeFormat(LOCALE, {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  }).format(localDateToUtcNoon(date));
}

/** Lokales Datum als „16. November 2026“ */
export function formatDayLong(date: LocalDate): string {
  return new Intl.DateTimeFormat(LOCALE, { dateStyle: "long", timeZone: "UTC" }).format(localDateToUtcNoon(date));
}

export function formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** Uhrzeit eines Zeitpunkts in der Zeitzone der App (z. B. 18:05). */
export function formatTime(instant: Date | string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(
    typeof instant === "string" ? new Date(instant) : instant,
  );
}
