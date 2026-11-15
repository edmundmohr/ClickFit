/**
 * Verlauf des Körpergewichts: wählbarer Zeitraum für Diagramm und Liste.
 * Der Trend wird immer über alle Messungen berechnet und erst danach auf den Zeitraum
 * begrenzt; so beginnt die Kurve nicht mit einem ungeglätteten Einzelwert.
 */
import type { TrendPoint } from "@/domain/nutrition/adaptive";
import { addDays, type LocalDate } from "@/lib/dates";

export const WEIGHT_RANGES = ["30", "90", "180", "365", "all"] as const;
export type WeightRange = (typeof WEIGHT_RANGES)[number];
export const DEFAULT_WEIGHT_RANGE: WeightRange = "180";

/** Ab so vielen Tagen trägt die Achsenbeschriftung das Jahr. */
const YEAR_LABEL_MIN_DAYS = 365;

/** Zeitraum aus dem Suchparameter; Unbekanntes fällt auf den Standard zurück. */
export function parseWeightRange(value: unknown): WeightRange {
  return WEIGHT_RANGES.find((range) => range === value) ?? DEFAULT_WEIGHT_RANGE;
}

/** Erster Tag des Zeitraums (einschließlich); `null` für den gesamten Verlauf. */
export function weightRangeStart(range: WeightRange, today: LocalDate): LocalDate | null {
  return range === "all" ? null : addDays(today, -(Number(range) - 1));
}

/** Messungen ab `from`; ohne Startdatum alle. Die Reihenfolge bleibt erhalten. */
export function pointsInRange<T extends { date: LocalDate }>(points: readonly T[], from: LocalDate | null): T[] {
  return from === null ? [...points] : points.filter((point) => point.date >= from);
}

/** Veränderung des Trends zwischen erster und letzter Messung; `null` unter zwei Messungen. */
export function trendChangeInRange(points: readonly TrendPoint[]): number | null {
  const first = points.at(0);
  const last = points.at(-1);
  if (!first || !last || points.length < 2) return null;
  return last.trendKg - first.trendKg;
}

/** Ob die Achse das Jahr zeigen soll: bei langen Zeiträumen oder Messungen über einen Jahreswechsel. */
export function needsYearLabels(range: WeightRange, points: readonly { date: LocalDate }[]): boolean {
  if (range !== "all") return Number(range) >= YEAR_LABEL_MIN_DAYS;
  const first = points.at(0);
  const last = points.at(-1);
  return Boolean(first && last && first.date.slice(0, 4) !== last.date.slice(0, 4));
}
