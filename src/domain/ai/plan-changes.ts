/**
 * Vorschläge der KI zum Trainingsplan prüfen und anwenden. Die KI darf nur vorschlagen;
 * was davon gültig ist, entscheiden diese Regeln. Reine Funktionen ohne Framework.
 */
import type { ExerciseType } from "@/domain/exercises/types";

export const PLAN_CHANGE_ACTIONS = ["replace", "add", "remove", "adjust"] as const;
export type PlanChangeAction = (typeof PLAN_CHANGE_ACTIONS)[number];

/** Ein Vorschlag, wie ihn die KI liefert (ungeprüft). */
export interface RawPlanChange {
  dayId: string;
  action: PlanChangeAction;
  /** Betroffene Übung im Plan; bei `add` die neue Übung. */
  exerciseId: string;
  /** Nur bei `replace`: die Übung, die stattdessen kommt. */
  newExerciseId: string | null;
  sets: number | null;
  repMin: number | null;
  repMax: number | null;
  reason: string;
}

export interface PlanExerciseSnapshot {
  exerciseId: string;
  name: string;
  type: ExerciseType;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
  groupId: string | null;
}

export interface PlanDaySnapshot {
  id: string;
  title: string;
  exercises: PlanExerciseSnapshot[];
}

export interface CandidateExercise {
  id: string;
  name: string;
  type: ExerciseType;
}

/** Geprüfter Vorschlag mit den Namen für die Anzeige. */
export interface PlanChange extends RawPlanChange {
  dayTitle: string;
  exerciseName: string;
  newExerciseName: string | null;
}

export const MAX_PLAN_CHANGES = 12;
export const MAX_EXERCISES_PER_DAY = 10;
const MIN_EXERCISES_PER_DAY = 2;
const MAX_REASON_LENGTH = 300;
const SET_RANGE = { min: 1, max: 8 };
const REP_RANGE = { min: 1, max: 30 };
const SECONDS_RANGE = { min: 5, max: 300 };
const DEFAULT_NEW = { sets: 3, repMin: 8, repMax: 12, targetRir: 2, restSeconds: 90 };
const DEFAULT_NEW_SECONDS = { repMin: 30, repMax: 60 };

function isInteger(value: number | null, range: { min: number; max: number }): value is number {
  return value !== null && Number.isInteger(value) && value >= range.min && value <= range.max;
}

function repRange(type: ExerciseType): { min: number; max: number } {
  return type === "duration" ? SECONDS_RANGE : REP_RANGE;
}

/**
 * Prüft Sätze und Wiederholungen eines Vorschlags. Fehlende Angaben übernehmen den
 * bisherigen Wert; `null` als Ergebnis heißt: unzulässig.
 */
function resolvePrescription(
  change: RawPlanChange,
  type: ExerciseType,
  current: { sets: number; repMin: number; repMax: number },
): { sets: number; repMin: number; repMax: number } | null {
  const sets = change.sets ?? current.sets;
  const repMin = change.repMin ?? current.repMin;
  const repMax = change.repMax ?? current.repMax;
  const range = repRange(type);
  if (!isInteger(sets, SET_RANGE) || !isInteger(repMin, range) || !isInteger(repMax, range) || repMin > repMax) {
    return null;
  }
  return { sets, repMin, repMax };
}

/**
 * Behält nur Vorschläge, die sich sicher anwenden lassen: bekannter Tag, Übung im Plan bzw.
 * aus der erlaubten Auswahl, sinnvolle Werte, keine Doppelungen. Die Reihenfolge bleibt.
 */
export function validatePlanChanges(
  days: readonly PlanDaySnapshot[],
  rawChanges: readonly RawPlanChange[],
  candidates: ReadonlyMap<string, CandidateExercise>,
): PlanChange[] {
  const valid: PlanChange[] = [];
  // Stand der Tage nach den bisher akzeptierten Vorschlägen.
  const state = new Map(days.map((day) => [day.id, new Map(day.exercises.map((item) => [item.exerciseId, item]))]));
  const touched = new Set<string>();

  for (const change of rawChanges) {
    if (valid.length >= MAX_PLAN_CHANGES) break;
    const day = days.find((item) => item.id === change.dayId);
    const exercises = state.get(change.dayId);
    if (!day || !exercises) continue;
    const key = `${change.dayId}:${change.exerciseId}`;
    if (touched.has(key)) continue;
    const reason = change.reason.trim().slice(0, MAX_REASON_LENGTH);
    const base = { ...change, reason, dayTitle: day.title };
    const current = exercises.get(change.exerciseId);

    if (change.action === "add") {
      const candidate = candidates.get(change.exerciseId);
      if (!candidate || current || exercises.size >= MAX_EXERCISES_PER_DAY) continue;
      const defaults = candidate.type === "duration" ? { ...DEFAULT_NEW, ...DEFAULT_NEW_SECONDS } : DEFAULT_NEW;
      const prescription = resolvePrescription(change, candidate.type, defaults);
      if (!prescription) continue;
      exercises.set(candidate.id, {
        exerciseId: candidate.id,
        name: candidate.name,
        type: candidate.type,
        ...defaults,
        ...prescription,
        groupId: null,
      });
      valid.push({ ...base, ...prescription, newExerciseId: null, exerciseName: candidate.name, newExerciseName: null });
    } else if (!current) {
      continue;
    } else if (change.action === "remove") {
      if (exercises.size <= MIN_EXERCISES_PER_DAY) continue;
      exercises.delete(current.exerciseId);
      valid.push({ ...base, newExerciseId: null, sets: null, repMin: null, repMax: null, exerciseName: current.name, newExerciseName: null });
    } else if (change.action === "replace") {
      const candidate = change.newExerciseId ? candidates.get(change.newExerciseId) : undefined;
      if (!candidate || exercises.has(candidate.id)) continue;
      // Wechselt die Art (z. B. Wiederholungen → Sekunden), gelten die Vorgaben der neuen Art.
      const sameKind = (candidate.type === "duration") === (current.type === "duration");
      const fallback = sameKind ? current : { sets: current.sets, ...(candidate.type === "duration" ? DEFAULT_NEW_SECONDS : DEFAULT_NEW) };
      const prescription = resolvePrescription(change, candidate.type, fallback);
      if (!prescription) continue;
      exercises.delete(current.exerciseId);
      exercises.set(candidate.id, { ...current, ...prescription, exerciseId: candidate.id, name: candidate.name, type: candidate.type });
      touched.add(`${change.dayId}:${candidate.id}`);
      valid.push({ ...base, ...prescription, newExerciseId: candidate.id, exerciseName: current.name, newExerciseName: candidate.name });
    } else {
      if (change.sets === null && change.repMin === null && change.repMax === null) continue;
      const prescription = resolvePrescription(change, current.type, current);
      if (!prescription) continue;
      const unchanged =
        prescription.sets === current.sets && prescription.repMin === current.repMin && prescription.repMax === current.repMax;
      if (unchanged) continue;
      exercises.set(current.exerciseId, { ...current, ...prescription });
      valid.push({ ...base, ...prescription, newExerciseId: null, exerciseName: current.name, newExerciseName: null });
    }
    touched.add(key);
  }
  return valid;
}

/** Die Übungen eines Tages nach Anwenden der geprüften Vorschläge, in der Reihenfolge des Plans. */
export function applyPlanChanges(
  day: PlanDaySnapshot,
  changes: readonly PlanChange[],
  candidates: ReadonlyMap<string, CandidateExercise>,
): PlanExerciseSnapshot[] {
  let exercises = [...day.exercises];
  for (const change of changes) {
    if (change.dayId !== day.id) continue;
    const index = exercises.findIndex((item) => item.exerciseId === change.exerciseId);
    const prescription =
      change.sets !== null && change.repMin !== null && change.repMax !== null
        ? { sets: change.sets, repMin: change.repMin, repMax: change.repMax }
        : null;
    if (change.action === "add") {
      const candidate = candidates.get(change.exerciseId);
      if (!candidate || index >= 0 || !prescription) continue;
      exercises.push({
        exerciseId: candidate.id,
        name: candidate.name,
        type: candidate.type,
        targetRir: DEFAULT_NEW.targetRir,
        restSeconds: DEFAULT_NEW.restSeconds,
        groupId: null,
        ...prescription,
      });
    } else if (index < 0) {
      continue;
    } else if (change.action === "remove") {
      exercises = exercises.filter((_, position) => position !== index);
    } else if (change.action === "replace") {
      const candidate = change.newExerciseId ? candidates.get(change.newExerciseId) : undefined;
      if (!candidate || !prescription) continue;
      exercises[index] = { ...exercises[index], ...prescription, exerciseId: candidate.id, name: candidate.name, type: candidate.type };
    } else if (prescription) {
      exercises[index] = { ...exercises[index], ...prescription };
    }
  }
  return exercises;
}
