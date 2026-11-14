/**
 * Fachlogik für Mobility-Routinen: Schritte ausrollen, Dauer schätzen, nach Region und
 * Beschwerde filtern.
 */
import {
  MOBILITY_SIDES,
  type MobilityComplaint,
  type MobilityExercise,
  type MobilityExerciseLookup,
  type MobilityFilter,
  type MobilityRegion,
  type MobilityRoutine,
  type MobilityRoutineItem,
  type MobilityRoutineSummary,
  type MobilityStep,
} from "./types";

/** Zeit, um zwischen zwei Schritten die Position zu wechseln. */
export const STEP_SWITCH_SECONDS = 5;
/** Geschätzte Dauer einer ruhigen Wiederholung, wenn die Übung nichts anderes angibt. */
export const DEFAULT_REP_SECONDS = 4;

const PRIMARY_MATCH = 2;
const SECONDARY_MATCH = 1;

function toSteps(exercise: MobilityExercise, item: MobilityRoutineItem): MobilityStep[] {
  const timed = exercise.durationSeconds !== undefined;
  const durationSeconds = timed ? (item.durationSeconds ?? exercise.durationSeconds) : null;
  const reps = timed ? null : (item.reps ?? exercise.reps);
  const estimatedSeconds = durationSeconds ?? (reps ?? 0) * (exercise.repSeconds ?? DEFAULT_REP_SECONDS);
  const sides = exercise.perSide ? MOBILITY_SIDES : [null];
  return sides.map((side) => ({ exercise, side, durationSeconds, reps, estimatedSeconds }));
}

/**
 * Rollt eine Routine in die Schritte des geführten Ablaufs aus: Übungen mit `perSide`
 * ergeben zwei Schritte (links, rechts). Unbekannte Übungen sind ein Fehler in den Daten.
 */
export function expandRoutine(routine: MobilityRoutine, exercises: MobilityExerciseLookup): MobilityStep[] {
  return routine.items.flatMap((item) => {
    const exercise = exercises.get(item.exerciseId);
    if (!exercise) throw new Error(`Unknown mobility exercise "${item.exerciseId}" in routine "${routine.id}"`);
    return toSteps(exercise, item);
  });
}

/** Gesamtdauer aus den Schritten: Seiten zählen doppelt, dazwischen liegt je ein Wechsel. */
export function stepsDurationSeconds(steps: readonly MobilityStep[]): number {
  const work = steps.reduce((total, step) => total + step.estimatedSeconds, 0);
  return work + Math.max(0, steps.length - 1) * STEP_SWITCH_SECONDS;
}

export function routineDurationSeconds(routine: MobilityRoutine, exercises: MobilityExerciseLookup): number {
  return stepsDurationSeconds(expandRoutine(routine, exercises));
}

export function summarizeRoutine(routine: MobilityRoutine, exercises: MobilityExerciseLookup): MobilityRoutineSummary {
  const steps = expandRoutine(routine, exercises);
  const { id, name, description, regions, complaints, level } = routine;
  return {
    id,
    name,
    description,
    regions,
    complaints,
    level,
    durationSeconds: stepsDurationSeconds(steps),
    stepCount: steps.length,
  };
}

/** Was der Filter von einer Routine braucht; so funktioniert er auch mit angereicherten Listeneinträgen. */
interface Filterable {
  regions: readonly MobilityRegion[];
  complaints: readonly MobilityComplaint[];
  durationSeconds: number;
}

/** 0 = passt nicht, 1 = kommt vor, 2 = ist der Schwerpunkt (erster Eintrag). */
function matchScore<T>(values: readonly T[], wanted: T): number {
  const index = values.indexOf(wanted);
  if (index < 0) return 0;
  return index === 0 ? PRIMARY_MATCH : SECONDARY_MATCH;
}

/**
 * Routinen, die zur gewählten Region und/oder Beschwerde passen. Sind beide gesetzt, muss
 * beides passen. Sortiert nach Passung (Schwerpunkt vor Nebenschauplatz), dann nach Dauer.
 * Ohne Filter kommen alle Routinen zurück, die kürzesten zuerst.
 */
export function filterRoutines<T extends Filterable>(routines: readonly T[], filter: MobilityFilter): T[] {
  const { region, complaint } = filter;
  const scored: { routine: T; score: number }[] = [];
  for (const routine of routines) {
    const regionScore = region ? matchScore(routine.regions, region) : 0;
    const complaintScore = complaint ? matchScore(routine.complaints, complaint) : 0;
    if ((region && regionScore === 0) || (complaint && complaintScore === 0)) continue;
    scored.push({ routine, score: regionScore + complaintScore });
  }
  // Array.prototype.sort ist stabil: Bei Gleichstand bleibt die Reihenfolge des Katalogs.
  return scored
    .sort((a, b) => b.score - a.score || a.routine.durationSeconds - b.routine.durationSeconds)
    .map((entry) => entry.routine);
}
