/**
 * Zustand des Trainingsmodus im Browser. Zahlenfelder bleiben Text, damit Eingaben wie „62,“
 * beim Tippen nicht verloren gehen; erst beim Speichern wird nach kg umgerechnet.
 */
import type { ExerciseType } from "@/domain/exercises/types";
import type { LoggedSet } from "@/domain/training/records";
import type { SetType } from "@/domain/training/types";
import type { WeightUnit } from "@/domain/training/weights";
import { fromDisplayWeight, parseDecimal, toDisplayWeight, unitSystemOf } from "@/lib/units";
import type { SaveSetInput } from "../../schemas";
import type { WorkoutExerciseView, WorkoutSetView } from "../../services/workout-view";

export interface SetDraft {
  id: string;
  type: SetType;
  weightText: string;
  repsText: string;
  rir: number | null;
  note: string;
  completed: boolean;
}

export interface ExerciseDraft extends Omit<WorkoutExerciseView, "sets"> {
  sets: SetDraft[];
}

export function usesWeight(type: ExerciseType): boolean {
  return type === "weight_reps" || type === "weighted_bodyweight" || type === "assisted_bodyweight";
}

/** Zahl für ein Eingabefeld: deutsches Komma, keine unnötigen Nachkommastellen. */
export function toInputText(value: number | null): string {
  return value === null ? "" : String(value).replace(".", ",");
}

function toDraft(set: WorkoutSetView, unit: WeightUnit): SetDraft {
  // Noch nicht geloggte Sätze sind mit den Zielwerten vorbelegt: Ein Tipp genügt zum Abhaken.
  const weightKg = set.weightKg ?? set.targetWeightKg;
  return {
    id: set.id,
    type: set.type,
    weightText: toInputText(weightKg === null ? null : toDisplayWeight(weightKg, unitSystemOf(unit))),
    repsText: toInputText(set.reps ?? set.targetReps),
    rir: set.rir,
    note: set.note ?? "",
    completed: set.completed,
  };
}

/** Jede Übung wird in ihrer eigenen Einheit angezeigt (z. B. Kurzhanteln in lbs, Stange in kg). */
export function toDrafts(exercises: WorkoutExerciseView[]): ExerciseDraft[] {
  return exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.map((set) => toDraft(set, exercise.unit)),
  }));
}

export function parseWeightKg(set: SetDraft, unit: WeightUnit): number | null {
  const value = parseDecimal(set.weightText);
  return value === null ? null : fromDisplayWeight(value, unitSystemOf(unit));
}

export function parseReps(set: SetDraft): number | null {
  const value = parseDecimal(set.repsText);
  return value === null ? null : Math.round(value);
}

export function toSavePayload(exercise: ExerciseDraft, set: SetDraft): SaveSetInput {
  return {
    id: set.id,
    workoutExerciseId: exercise.id,
    position: exercise.sets.findIndex((item) => item.id === set.id),
    type: set.type,
    weightKg: usesWeight(exercise.type) ? parseWeightKg(set, exercise.unit) : null,
    reps: parseReps(set),
    rir: set.rir,
    note: set.note.trim() || null,
    completed: set.completed,
  };
}

export function toLoggedSet(exercise: ExerciseDraft, set: SetDraft): LoggedSet {
  return {
    type: set.type,
    weightKg: usesWeight(exercise.type) ? parseWeightKg(set, exercise.unit) : null,
    reps: parseReps(set),
    completed: set.completed,
  };
}

/** Noch nicht übertragene Änderungen aus der Offline-Warteschlange. */
export interface PendingChanges {
  saves: SaveSetInput[];
  deletedSetIds: string[];
}

function fromPayload(payload: SaveSetInput, unit: WeightUnit): SetDraft {
  return {
    id: payload.id,
    type: payload.type,
    weightText: toInputText(payload.weightKg === null ? null : toDisplayWeight(payload.weightKg, unitSystemOf(unit))),
    repsText: toInputText(payload.reps),
    rir: payload.rir,
    note: payload.note ?? "",
    completed: payload.completed,
  };
}

/**
 * Legt wartende Änderungen über den vom Server geladenen Stand: Nach einem Neuladen ohne Netz
 * zeigt die Seite sonst einen älteren Stand als den, der auf dem Gerät gespeichert ist.
 */
export function applyPendingChanges(state: ExerciseDraft[], changes: PendingChanges): ExerciseDraft[] {
  const deleted = new Set(changes.deletedSetIds);
  return state.map((exercise) => {
    const sets = exercise.sets.filter((set) => !deleted.has(set.id));
    const saves = changes.saves
      .filter((payload) => payload.workoutExerciseId === exercise.id)
      .sort((a, b) => a.position - b.position);
    for (const payload of saves) {
      const draft = fromPayload(payload, exercise.unit);
      const index = sets.findIndex((set) => set.id === payload.id);
      if (index >= 0) sets[index] = draft;
      else sets.splice(Math.min(payload.position, sets.length), 0, draft);
    }
    return { ...exercise, sets };
  });
}

export type WorkoutAction =
  | { type: "restore"; changes: PendingChanges }
  | { type: "edit"; exerciseId: string; setId: string; patch: Partial<SetDraft> }
  | { type: "add"; exerciseId: string; set: SetDraft }
  | { type: "remove"; exerciseId: string; setId: string }
  | { type: "prepend"; exerciseId: string; sets: SetDraft[] }
  | { type: "note"; catalogExerciseId: string; note: string };

export function workoutReducer(state: ExerciseDraft[], action: WorkoutAction): ExerciseDraft[] {
  if (action.type === "restore") return applyPendingChanges(state, action.changes);
  if (action.type === "note") {
    return state.map((exercise) =>
      exercise.exerciseId === action.catalogExerciseId ? { ...exercise, note: action.note } : exercise,
    );
  }
  return state.map((exercise) => {
    if (exercise.id !== action.exerciseId) return exercise;
    switch (action.type) {
      case "edit":
        return {
          ...exercise,
          sets: exercise.sets.map((set) => (set.id === action.setId ? { ...set, ...action.patch } : set)),
        };
      case "add":
        return { ...exercise, sets: [...exercise.sets, action.set] };
      case "remove":
        return { ...exercise, sets: exercise.sets.filter((set) => set.id !== action.setId) };
      case "prepend":
        return { ...exercise, sets: [...action.sets, ...exercise.sets] };
    }
  });
}

/** Neuer Satz als Kopie der Werte des letzten Satzes. */
export function newSetFrom(last: SetDraft | undefined, id: string): SetDraft {
  return {
    id,
    type: last && last.type !== "warmup" ? last.type : "work",
    weightText: last?.weightText ?? "",
    repsText: last?.repsText ?? "",
    rir: null,
    note: "",
    completed: false,
  };
}

/** Laufende Nummer eines Satzes unter den Nicht-Aufwärmsätzen (1-basiert). */
export function workSetNumber(sets: readonly SetDraft[], setId: string): number {
  let number = 0;
  for (const set of sets) {
    if (set.type !== "warmup") number++;
    if (set.id === setId) return Math.max(number, 1);
  }
  return 1;
}

/** Stand einer Übung für die Supersatz-Logik: Aufwärmsätze zählen nicht als Durchgang. */
export function toGroupMember(exercise: ExerciseDraft) {
  const work = exercise.sets.filter((set) => set.type !== "warmup");
  return {
    id: exercise.id,
    groupId: exercise.groupId,
    completedSets: work.filter((set) => set.completed).length,
    totalSets: work.length,
  };
}
