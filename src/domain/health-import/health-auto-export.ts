/**
 * Format der iOS-App „Health Auto Export“ (REST-API-Automation, JSON):
 *
 * { "data": {
 *     "metrics":  [{ "name": "weight_body_mass" | "step_count" | "resting_heart_rate",
 *                    "units"?: "kg" | "lb" | …, "data": [{ "date": "2026-11-14 07:31:00 +0100", "qty": 81.2 }] }],
 *     "workouts": [{ "id"?, "name": "Running", "start": "…", "end"?: "…", "duration"?: Sekunden,
 *                    "distance"?: { "qty": 5.2, "units": "km" | "mi" | "m" },
 *                    "avgHeartRate"?: { "qty": 150 }, "heartRate"?: { "avg": { "qty": 150 } } }]
 * } }
 *
 * Unbekannte Metriken werden ignoriert, unvollständige Einträge übersprungen und gezählt.
 */
import { createCollector, type HealthImportCollector } from "./collector";
import { parseMoment, type Moment } from "./timestamps";
import { HealthImportError, type HealthImport } from "./types";
import { isObject, toIdentifier, toKg, toMeters, toNumber, weightUnitOf, type JsonObject } from "./values";
import { resolveTiming } from "./workout-timing";
import { STRENGTH, mapWorkoutName } from "./workout-types";

type AddValue = (when: Moment, value: number) => unknown;

/** Erkennt das Format am Umschlag `data` mit `metrics` oder `workouts`. */
export function isHealthAutoExport(json: unknown): json is { data: JsonObject } {
  return isObject(json) && isObject(json.data) && ("metrics" in json.data || "workouts" in json.data);
}

function readSamples(collector: HealthImportCollector, samples: unknown, add: AddValue, convert: (qty: number) => number): void {
  if (!Array.isArray(samples)) return collector.skip();
  for (const sample of samples) {
    const when = isObject(sample) ? parseMoment(sample.date) : null;
    const qty = isObject(sample) ? toNumber(sample.qty) : null;
    if (when === null || qty === null) collector.skip();
    else add(when, convert(qty));
  }
}

function readMetric(collector: HealthImportCollector, metric: unknown): void {
  if (!isObject(metric) || typeof metric.name !== "string") return collector.skip();
  const same = (qty: number) => qty;
  switch (metric.name.trim().toLowerCase()) {
    case "weight_body_mass": {
      // Ohne Angabe gilt kg; eine unbekannte Einheit (z. B. Stone) lässt sich nicht sicher umrechnen.
      const unit = typeof metric.units === "string" ? weightUnitOf(metric.units) : "kg";
      if (unit === null) return collector.skip(Array.isArray(metric.data) ? metric.data.length : 1);
      return readSamples(collector, metric.data, collector.addWeight, (qty) => toKg(qty, unit));
    }
    case "step_count":
      return readSamples(collector, metric.data, collector.addSteps, same);
    case "resting_heart_rate":
      return readSamples(collector, metric.data, collector.addRestingHeartRate, same);
    default:
      return;
  }
}

/** Zahl aus `{ qty }` oder direkt als Zahl. */
function quantityOf(value: unknown): number | null {
  return isObject(value) ? toNumber(value.qty) : toNumber(value);
}

function distanceOf(value: unknown): number | null {
  if (!isObject(value)) return null;
  const qty = toNumber(value.qty);
  return qty === null || typeof value.units !== "string" ? null : toMeters(qty, value.units);
}

function readWorkout(collector: HealthImportCollector, workout: unknown, now: Date): void {
  if (!isObject(workout) || typeof workout.name !== "string" || workout.start === undefined) return collector.skip();
  const type = mapWorkoutName(workout.name);
  if (type === STRENGTH) return collector.skip();
  const timing = resolveTiming({ start: workout.start, end: workout.end, durationSeconds: toNumber(workout.duration) }, now);
  if (!timing.ok) return collector.skip();
  const heartRate = isObject(workout.heartRate) ? workout.heartRate.avg : undefined;
  collector.addWorkout({
    id: toIdentifier(workout.id),
    type,
    start: timing.start,
    durationSeconds: timing.durationSeconds,
    distanceMeters: distanceOf(workout.distance),
    avgHeartRate: quantityOf(workout.avgHeartRate) ?? quantityOf(heartRate),
  });
}

export function parseHealthAutoExport(json: unknown, now: Date = new Date()): HealthImport {
  if (!isHealthAutoExport(json)) throw new HealthImportError("format");
  const { metrics, workouts } = json.data;
  const lists = [metrics, workouts].filter((list) => list !== undefined && list !== null);
  if (lists.length === 0 || lists.some((list) => !Array.isArray(list))) throw new HealthImportError("format");

  const collector = createCollector(now);
  if (Array.isArray(metrics)) for (const metric of metrics) readMetric(collector, metric);
  if (Array.isArray(workouts)) for (const workout of workouts) readWorkout(collector, workout, now);
  return collector.build();
}
