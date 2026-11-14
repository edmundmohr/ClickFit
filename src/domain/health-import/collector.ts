/**
 * Sammelt die Einträge eines Imports, prüft sie auf Plausibilität und fasst sie je Tag zusammen:
 * Schritte werden addiert, bei Gewicht und Ruhepuls gilt der letzte Wert des Tages.
 */
import type { ActivityType } from "@/domain/cardio/types";
import { toLocalDate, type LocalDate } from "@/lib/dates";
import type { Moment } from "./timestamps";
import { HealthImportError, LIMITS, type EntryIssue, type HealthImport, type ImportedWorkout } from "./types";

export interface WorkoutCandidate {
  /** Kennung der Quelle; fehlt sie, wird sie aus Art und Startzeit abgeleitet. */
  id: string | null;
  type: ActivityType;
  start: Moment;
  durationSeconds: number;
  distanceMeters: number | null;
  avgHeartRate: number | null;
}

export interface HealthImportCollector {
  /** Jede Methode gibt `null` zurück, wenn der Eintrag übernommen wurde, sonst den Grund. */
  addWeight(when: Moment, kg: number): EntryIssue | null;
  addSteps(when: Moment, count: number): EntryIssue | null;
  addRestingHeartRate(when: Moment, bpm: number): EntryIssue | null;
  addWorkout(candidate: WorkoutCandidate): EntryIssue | null;
  /** Zählt einen Eintrag, der schon vor der Prüfung verworfen wurde. */
  skip(count?: number): void;
  build(): HealthImport;
}

interface Latest {
  value: number;
  at: number;
}

const inRange = (value: number, [min, max]: readonly [number, number]) => Number.isFinite(value) && value >= min && value <= max;
const round = (value: number, decimals: number) => Math.round(value * 10 ** decimals) / 10 ** decimals;

/** Stabile Kennung für Einheiten, deren Quelle keine liefert. */
export function deriveExternalId(type: ActivityType, start: Date): string {
  return `auto:${type}:${start.toISOString()}`;
}

function cleanExternalId(id: string | null): string | null {
  const trimmed = id?.trim() ?? "";
  return trimmed.length > 0 && trimmed.length <= LIMITS.maxExternalIdLength ? trimmed : null;
}

function byDate<T extends { date: LocalDate }>(left: T, right: T): number {
  return left.date < right.date ? -1 : left.date > right.date ? 1 : 0;
}

export function createCollector(now: Date): HealthImportCollector {
  const latestInstant = now.getTime() + LIMITS.futureToleranceMs;
  const latestDate = toLocalDate(new Date(latestInstant));
  const oldest = new Date(now);
  oldest.setUTCFullYear(oldest.getUTCFullYear() - LIMITS.maxAgeYears);
  const oldestDate = toLocalDate(oldest);

  const weights = new Map<LocalDate, Latest>();
  const steps = new Map<LocalDate, number>();
  const restingHeartRates = new Map<LocalDate, Latest>();
  const workouts = new Map<string, ImportedWorkout>();
  const counts = { weight: 0, steps: 0, restingHeartRate: 0, workouts: 0 };
  let skipped = 0;

  /** Zählt jeden vorgelegten Eintrag, auch verworfene: Die Grenze schützt vor übergroßen Anfragen. */
  function count(kind: keyof typeof counts): void {
    counts[kind] += 1;
    if (counts[kind] > LIMITS.maxEntriesPerKind) throw new HealthImportError("too_many_entries");
  }

  function plausible(when: Moment): boolean {
    if (when.date < oldestDate || when.date > latestDate) return false;
    return !when.hasTime || when.instant.getTime() <= latestInstant;
  }

  function reject(issue: EntryIssue): EntryIssue {
    skipped += 1;
    return issue;
  }

  function keepLatest(target: Map<LocalDate, Latest>, when: Moment, value: number): void {
    const existing = target.get(when.date);
    // Bei gleichem Zeitpunkt gewinnt der spätere Eintrag der Eingabe.
    if (!existing || when.instant.getTime() >= existing.at) target.set(when.date, { value, at: when.instant.getTime() });
  }

  return {
    addWeight(when, kg) {
      count("weight");
      if (!plausible(when)) return reject("date");
      if (!inRange(kg, LIMITS.weightKg)) return reject("range");
      keepLatest(weights, when, round(kg, 2));
      return null;
    },
    addSteps(when, value) {
      count("steps");
      if (!plausible(when)) return reject("date");
      const total = (steps.get(when.date) ?? 0) + value;
      if (!inRange(value, LIMITS.steps) || !inRange(total, LIMITS.steps)) return reject("range");
      steps.set(when.date, total);
      return null;
    },
    addRestingHeartRate(when, bpm) {
      count("restingHeartRate");
      if (!plausible(when)) return reject("date");
      if (!inRange(bpm, LIMITS.restingHeartRate)) return reject("range");
      keepLatest(restingHeartRates, when, Math.round(bpm));
      return null;
    },
    addWorkout(candidate) {
      count("workouts");
      if (!plausible(candidate.start)) return reject("date");
      const durationSeconds = Math.round(candidate.durationSeconds);
      if (!inRange(durationSeconds, LIMITS.durationSeconds)) return reject("range");
      const { distanceMeters, avgHeartRate, type } = candidate;
      const start = candidate.start.instant;
      const externalId = cleanExternalId(candidate.id) ?? deriveExternalId(type, start);
      // Unbrauchbare Zusatzwerte verwerfen wir, die Einheit selbst bleibt erhalten.
      workouts.set(externalId, {
        externalId,
        type,
        start,
        durationSeconds,
        distanceMeters:
          distanceMeters !== null && Number.isFinite(distanceMeters) && distanceMeters > 0 && distanceMeters <= LIMITS.maxDistanceMeters
            ? round(distanceMeters, 1)
            : null,
        avgHeartRate: avgHeartRate !== null && inRange(avgHeartRate, LIMITS.avgHeartRate) ? Math.round(avgHeartRate) : null,
      });
      return null;
    },
    skip(amount = 1) {
      skipped += amount;
    },
    build() {
      return {
        weights: [...weights].map(([date, entry]) => ({ date, kg: entry.value })).sort(byDate),
        steps: [...steps].map(([date, total]) => ({ date, count: Math.round(total) })).sort(byDate),
        restingHeartRates: [...restingHeartRates].map(([date, entry]) => ({ date, bpm: entry.value })).sort(byDate),
        workouts: [...workouts.values()].sort((left, right) => left.start.getTime() - right.start.getTime()),
        skipped,
      };
    },
  };
}
