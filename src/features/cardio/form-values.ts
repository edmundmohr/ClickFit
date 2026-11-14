/**
 * Hilfen für die Cardio-Formulare: Texteingaben lesen und Vorbelegungen bauen.
 */
import type { ActivityType, HeartRateZone, Intensity, Interval } from "@/domain/cardio/types";
import { DEFAULT_INTERVAL } from "@/domain/cardio/plan";
import { addDays, startOfWeek, type LocalDate } from "@/lib/dates";
import { parseDecimal } from "@/lib/units";
import type { CardioPlanEntry } from "./services/cardio-plan-service";

/** Ergebnis einer Eingabe: Zahl, `null` für ein leeres Feld oder `undefined` für eine ungültige Eingabe. */
export type ParsedNumber = number | null | undefined;

interface NumberRange {
  min: number;
  max: number;
  /** Nur ganze Zahlen zulassen. */
  whole?: boolean;
}

/** Liest ein Zahlenfeld; Komma und Punkt sind erlaubt. */
export function readNumber(text: string, { min, max, whole = false }: NumberRange): ParsedNumber {
  if (text.trim() === "") return null;
  const value = parseDecimal(text);
  if (value === null || value < min || value > max) return undefined;
  if (whole && !Number.isInteger(value)) return undefined;
  return value;
}

export interface IntervalFieldValues {
  enabled: boolean;
  work: string;
  rest: string;
  repeats: string;
}

export function toIntervalFields(interval: Interval | null): IntervalFieldValues {
  const values = interval ?? DEFAULT_INTERVAL;
  return {
    enabled: interval !== null,
    work: String(values.workSeconds),
    rest: String(values.restSeconds),
    repeats: String(values.repeats),
  };
}

/** Intervalle aus den Feldern; `null` ohne Intervalle, `undefined` bei ungültigen Werten. */
export function readIntervals(fields: IntervalFieldValues): Interval | null | undefined {
  if (!fields.enabled) return null;
  const workSeconds = readNumber(fields.work, { min: 5, max: 3600, whole: true });
  const restSeconds = readNumber(fields.rest, { min: 0, max: 3600, whole: true });
  const repeats = readNumber(fields.repeats, { min: 1, max: 100, whole: true });
  if (typeof workSeconds !== "number" || typeof restSeconds !== "number" || typeof repeats !== "number") return undefined;
  return { workSeconds, restSeconds, repeats };
}

/** Vorbelegung für das Formular „Einheit eintragen“. */
export interface ActivityDraft {
  type: ActivityType;
  date: LocalDate;
  minutes: number | null;
  zone: HeartRateZone | null;
  intensity: Intensity;
  intervals: Interval | null;
}

export function emptyActivityDraft(today: LocalDate): ActivityDraft {
  return { type: "running", date: today, minutes: null, zone: null, intensity: "moderate", intervals: null };
}

function intensityForZone(zone: HeartRateZone | null): Intensity {
  if (zone === null) return "moderate";
  if (zone >= 4) return "hard";
  return zone === 1 ? "easy" : "moderate";
}

/** Datum eines Wochentags in der laufenden Woche. */
export function dateOfWeekday(today: LocalDate, weekday: number): LocalDate {
  return addDays(startOfWeek(today), weekday - 1);
}

/** Übernimmt eine geplante Einheit: für ihren Tag in dieser Woche, falls der nicht in der Zukunft liegt. */
export function draftFromPlanEntry(entry: CardioPlanEntry, today: LocalDate): ActivityDraft {
  const planned = dateOfWeekday(today, entry.weekday);
  return {
    type: entry.type,
    date: planned <= today ? planned : today,
    minutes: entry.minutes,
    zone: entry.zone,
    intensity: intensityForZone(entry.zone),
    intervals: entry.intervals,
  };
}
