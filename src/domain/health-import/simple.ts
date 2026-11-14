/**
 * Eigenes einfaches JSON-Format für den Health-Import, auch für Home Assistant:
 *
 * {
 *   "weight":           81.2 | { "date"?, "kg"? | "lbs"? } | [ … ],
 *   "steps":            8500 | { "date"?, "count" } | [ … ],
 *   "restingHeartRate": 52   | { "date"?, "bpm" } | [ … ],
 *   "workouts":         [{ "id"?, "type", "start"?, "end"?, "durationMinutes"?, "distanceKm"?, "avgHeartRate"? }]
 * }
 *
 * Ohne Datum gilt heute. Zahlen dürfen auch als Text kommen („81.2“).
 */
import { createCollector, type HealthImportCollector } from "./collector";
import { momentOf, parseMoment, type Moment } from "./timestamps";
import { HealthImportError, type HealthImport } from "./types";
import { isObject, toIdentifier, toKg, toNumber, type JsonObject } from "./values";
import { resolveTiming } from "./workout-timing";
import { STRENGTH, mapWorkoutName } from "./workout-types";

export const SIMPLE_KEYS = ["weight", "steps", "restingHeartRate", "workouts"] as const;

const entriesOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : [value]);

/** Datum des Eintrags; ohne Angabe heute, bei unlesbarer Angabe `null`. */
function momentOfEntry(entry: JsonObject, today: Moment): Moment | null {
  return entry.date === undefined || entry.date === null ? today : parseMoment(entry.date);
}

/** Liest Einträge der Form Zahl oder `{ date?, <feld> }` und reicht sie an `add` weiter. */
function readValues(
  collector: HealthImportCollector,
  raw: unknown,
  today: Moment,
  valueOf: (entry: JsonObject) => number | null,
  add: (when: Moment, value: number) => unknown,
): void {
  for (const entry of entriesOf(raw)) {
    const when = isObject(entry) ? momentOfEntry(entry, today) : today;
    const value = isObject(entry) ? valueOf(entry) : toNumber(entry);
    if (when === null || value === null) collector.skip();
    else add(when, value);
  }
}

function weightOf(entry: JsonObject): number | null {
  const kg = toNumber(entry.kg);
  if (kg !== null) return kg;
  const lbs = toNumber(entry.lbs ?? entry.lb);
  return lbs === null ? null : toKg(lbs, "lbs");
}

function readWorkout(collector: HealthImportCollector, entry: unknown, now: Date): void {
  if (!isObject(entry) || typeof entry.type !== "string") return collector.skip();
  const type = mapWorkoutName(entry.type);
  if (type === STRENGTH) return collector.skip();
  const minutes = toNumber(entry.durationMinutes);
  const timing = resolveTiming({ start: entry.start, end: entry.end, durationSeconds: minutes === null ? null : minutes * 60 }, now);
  if (!timing.ok) return collector.skip();
  const distanceKm = toNumber(entry.distanceKm);
  collector.addWorkout({
    id: toIdentifier(entry.id),
    type,
    start: timing.start,
    durationSeconds: timing.durationSeconds,
    distanceMeters: distanceKm === null ? null : distanceKm * 1000,
    avgHeartRate: toNumber(entry.avgHeartRate),
  });
}

export function parseSimplePayload(json: unknown, now: Date): HealthImport {
  if (!isObject(json) || !SIMPLE_KEYS.some((key) => key in json)) throw new HealthImportError("format");
  const collector = createCollector(now);
  const today = momentOf(now);

  if ("weight" in json) readValues(collector, json.weight, today, weightOf, collector.addWeight);
  if ("steps" in json) readValues(collector, json.steps, today, (entry) => toNumber(entry.count), collector.addSteps);
  if ("restingHeartRate" in json) {
    readValues(collector, json.restingHeartRate, today, (entry) => toNumber(entry.bpm), collector.addRestingHeartRate);
  }
  if ("workouts" in json) {
    for (const entry of entriesOf(json.workouts)) readWorkout(collector, entry, now);
  }
  return collector.build();
}
