/**
 * Zeitangaben aus Importen lesen. Unterstützt werden ISO 8601, das Format von
 * „Health Auto Export“ (`yyyy-MM-dd HH:mm:ss Z`) und die deutsche Schreibweise `TT.MM.JJJJ`
 * (jeweils auch mit Uhrzeit). Angaben ohne Zeitzone gelten in der Zeitzone der App.
 */
import { TIME_ZONE } from "@/i18n/config";
import { isValidLocalDate, type LocalDate } from "@/lib/dates";

export interface Moment {
  /** Lokaler Kalendertag in der Zeitzone der App. */
  date: LocalDate;
  /** Zeitpunkt; bei reinen Datumsangaben der Mittag des Tages. */
  instant: Date;
  /** `false`, wenn nur ein Datum ohne Uhrzeit angegeben war. */
  hasTime: boolean;
}

const pad = (value: number | string, length = 2) => String(value).padStart(length, "0");

/** Formatierer sind teuer zu erzeugen; bei tausenden Einträgen je Import lohnt der Zwischenspeicher. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Abstand der Zeitzone zu UTC in Millisekunden zum gegebenen Zeitpunkt. */
function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const parts = formatterFor(timeZone).formatToParts(new Date(instantMs));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value ?? 0);
  const asUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

/**
 * Lokaler Kalendertag eines Zeitpunkts. Liefert dasselbe wie `toLocalDate` aus `@/lib/dates`,
 * kommt aber ohne neuen Formatierer je Aufruf aus.
 */
export function localDateOf(instant: Date, timeZone: string = TIME_ZONE): LocalDate {
  const ms = instant.getTime();
  return new Date(ms + zoneOffsetMs(ms, timeZone)).toISOString().slice(0, 10);
}

/** Zeitpunkt einer Uhrzeit, die in der Zeitzone der App gemeint ist (Sommerzeit berücksichtigt). */
export function localTimeToInstant(date: LocalDate, hour: number, minute: number, second: number, timeZone: string = TIME_ZONE): Date {
  const [year, month, day] = date.split("-").map(Number);
  const wallClock = Date.UTC(year, month - 1, day, hour, minute, second);
  // Zwei Schritte: Der Abstand am geschätzten Zeitpunkt kann um die Zeitumstellung herum noch falsch sein.
  const guess = wallClock - zoneOffsetMs(wallClock, timeZone);
  return new Date(wallClock - zoneOffsetMs(guess, timeZone));
}

const TIME = String.raw`(\d{1,2}):(\d{2})(?::(\d{2})(?:[.,]\d+)?)?`;
const ISO_DATE = String.raw`(\d{4})-(\d{2})-(\d{2})`;
const ZONE = String.raw`(Z|[+-]\d{2}:?\d{2}|[+-]\d{2})`;
const ISO_PATTERN = new RegExp(`^${ISO_DATE}(?:[T ]${TIME}(?: ?${ZONE})?)?$`, "i");
const GERMAN_PATTERN = new RegExp(String.raw`^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:,?[T ]+${TIME})?$`);

function validTime(hour: number, minute: number, second: number): boolean {
  return hour <= 23 && minute <= 59 && second <= 59;
}

function normalizeZone(zone: string): string {
  if (zone.toUpperCase() === "Z") return "Z";
  const digits = zone.slice(1).replace(":", "");
  return `${zone[0]}${digits.slice(0, 2)}:${digits.slice(2, 4) || "00"}`;
}

/** Liest eine Zeitangabe; `null`, wenn sie kein gültiges Datum ergibt. */
export function parseMoment(value: unknown): Moment | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (text.length === 0 || text.length > 40) return null;

  const german = GERMAN_PATTERN.exec(text);
  const iso = german ? null : ISO_PATTERN.exec(text);
  if (!german && !iso) return null;

  const date = german ? `${german[3]}-${pad(german[2])}-${pad(german[1])}` : `${iso?.[1]}-${iso?.[2]}-${iso?.[3]}`;
  if (!isValidLocalDate(date)) return null;
  const match = german ?? iso;
  const [hourText, minuteText, secondText] = [match?.[4], match?.[5], match?.[6]];
  if (hourText === undefined || minuteText === undefined) {
    return { date, instant: localTimeToInstant(date, 12, 0, 0), hasTime: false };
  }
  const [hour, minute, second] = [Number(hourText), Number(minuteText), Number(secondText ?? 0)];
  if (!validTime(hour, minute, second)) return null;

  const zone = iso?.[7];
  if (zone === undefined) return { date, instant: localTimeToInstant(date, hour, minute, second), hasTime: true };
  const instant = new Date(`${date}T${pad(hour)}:${pad(minute)}:${pad(second)}${normalizeZone(zone)}`);
  if (Number.isNaN(instant.getTime())) return null;
  // Mit Zeitzone zählt der Kalendertag in der Zeitzone der App, nicht der in der Angabe.
  return { date: localDateOf(instant), instant, hasTime: true };
}

/** „Jetzt“ als Zeitangabe, für Einträge ohne Datum. */
export function momentOf(now: Date): Moment {
  return { date: localDateOf(now), instant: now, hasTime: true };
}
