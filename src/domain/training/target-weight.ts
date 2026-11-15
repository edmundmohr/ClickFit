/**
 * Selbst festgelegtes Zielgewicht pro Übung einer Routine.
 *
 * - Ohne Angabe ergibt sich das Zielgewicht wie bisher aus der letzten Leistung (Progression).
 * - Mit Angabe startet die nächste Einheit mit genau diesem Gewicht. Danach übernimmt wieder die
 *   Progression, ausgehend von dem, was tatsächlich trainiert wurde.
 * - Jede Änderung wird im Verlauf der Übung festgehalten.
 */

export const MAX_TARGET_WEIGHT_KG = 1000;
/** Unterschiede darunter gelten als gleich (Rundung bei der Umrechnung kg ↔ lbs). */
const WEIGHT_TOLERANCE_KG = 0.01;

export interface StoredTargetWeight {
  exerciseId: string;
  targetWeightKg: number | null;
  targetWeightSetAt: Date | null;
}

export interface TargetWeightChange {
  exerciseId: string;
  fromKg: number | null;
  toKg: number | null;
}

export function sameWeight(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return a === b;
  return Math.abs(a - b) < WEIGHT_TOLERANCE_KG;
}

/** Erstes Vorkommen je Übung (eine Übung kann in einer Routine mehrfach stehen). */
function firstByExercise<T extends { exerciseId: string }>(items: readonly T[]): Map<string, T> {
  const result = new Map<string, T>();
  for (const item of items) if (!result.has(item.exerciseId)) result.set(item.exerciseId, item);
  return result;
}

/** Gespeichertes Zielgewicht einer Übung der Routine; `null`, wenn es keins gibt. */
export function keptTargetWeight(before: readonly StoredTargetWeight[], exerciseId: string): number | null {
  return firstByExercise(before).get(exerciseId)?.targetWeightKg ?? null;
}

/**
 * Geänderte Zielgewichte beim Speichern einer Routine. Neu hinzugefügte Übungen mit Gewicht
 * zählen als Änderung von „automatisch“; entfernte Übungen nicht.
 */
export function targetWeightChanges(
  before: readonly StoredTargetWeight[],
  after: readonly { exerciseId: string; targetWeightKg: number | null }[],
): TargetWeightChange[] {
  const previous = firstByExercise(before);
  return [...firstByExercise(after).values()].flatMap((entry) => {
    const fromKg = previous.get(entry.exerciseId)?.targetWeightKg ?? null;
    return sameWeight(fromKg, entry.targetWeightKg) ? [] : [{ exerciseId: entry.exerciseId, fromKg, toKg: entry.targetWeightKg }];
  });
}

/**
 * Zeitpunkt der letzten Änderung, der nach dem Speichern gilt: unverändertes Gewicht behält
 * seinen Zeitpunkt, ein neues bekommt `now`, ohne Gewicht gibt es keinen.
 */
export function targetWeightSetAt(
  before: readonly StoredTargetWeight[],
  exerciseId: string,
  weightKg: number | null,
  now: Date,
): Date | null {
  if (weightKg === null) return null;
  const previous = firstByExercise(before).get(exerciseId);
  if (previous && sameWeight(previous.targetWeightKg, weightKg)) return previous.targetWeightSetAt ?? now;
  return now;
}

/**
 * Gilt das eigene Zielgewicht für die nächste Einheit? Ja, solange die Übung seit der Änderung
 * nicht trainiert wurde. `lastTrainedAt` ist der Start der letzten Einheit mit dieser Übung.
 */
export function plannedWeightApplies(
  weightKg: number | null,
  setAt: Date | null,
  lastTrainedAt: Date | null,
): boolean {
  if (weightKg === null) return false;
  if (lastTrainedAt === null) return true;
  return setAt !== null && lastTrainedAt.getTime() < setAt.getTime();
}
