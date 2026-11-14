/**
 * Zustand des Plan-Builders im Browser.
 */
import type { ExerciseType } from "@/domain/exercises/types";
import { normalizeGroups } from "@/domain/training/supersets";

export interface EditorItem {
  /** Stabile Kennung für Drag & Drop (nicht die der Datenbank). */
  key: string;
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

export interface PickerExercise {
  id: string;
  name: string;
  type: ExerciseType;
  /** Übersetzte Hauptmuskeln als Text, für Anzeige und Suche. */
  muscles: string;
  custom: boolean;
}

export const MIN_SETS = 1;
export const MAX_SETS = 12;
export const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 120, 150, 180, 240, 300];
export const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];

/** Sinnvolle Vorgaben für eine neu hinzugefügte Übung, je nach Art. */
export function newItem(exercise: PickerExercise, key: string): EditorItem {
  const base = { key, exerciseId: exercise.id, name: exercise.name, type: exercise.type, groupId: null, targetRir: 2 };
  if (exercise.type === "duration") return { ...base, sets: 3, repMin: 30, repMax: 60, restSeconds: 60 };
  if (exercise.type === "bodyweight_reps") return { ...base, sets: 3, repMin: 8, repMax: 15, restSeconds: 90 };
  return { ...base, sets: 3, repMin: 8, repMax: 12, restSeconds: 90 };
}

export function moveItem(items: readonly EditorItem[], from: number, to: number): EditorItem[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  // Nach dem Verschieben bleiben nur Gruppen bestehen, deren Übungen noch nebeneinander liegen.
  return normalizeGroups(next);
}

export function isLinkedToNext(items: readonly EditorItem[], index: number): boolean {
  const current = items[index];
  const next = items[index + 1];
  return !!current && !!next && current.groupId !== null && current.groupId === next.groupId;
}

/** Verbindet die Übung mit der folgenden zu einem Supersatz bzw. erweitert einen Zirkel. */
export function linkWithNext(items: readonly EditorItem[], index: number, newGroupId: string): EditorItem[] {
  const current = items[index];
  const next = items[index + 1];
  if (!current || !next) return [...items];
  const groupId = current.groupId ?? next.groupId ?? newGroupId;
  const absorbed = next.groupId;
  return normalizeGroups(
    items.map((item, position) => {
      if (position === index || position === index + 1) return { ...item, groupId };
      // Hatte die nächste Übung schon eine Gruppe, wandert die ganze Gruppe mit.
      return absorbed !== null && item.groupId === absorbed ? { ...item, groupId } : item;
    }),
  );
}

/** Trennt die Gruppe zwischen dieser und der folgenden Übung. */
export function unlinkFromNext(items: readonly EditorItem[], index: number, newGroupId: string): EditorItem[] {
  const current = items[index];
  if (!current || current.groupId === null) return [...items];
  return normalizeGroups(
    items.map((item, position) =>
      position > index && item.groupId === current.groupId ? { ...item, groupId: newGroupId } : item,
    ),
  );
}

/** Wie viele Übungen zur Gruppe der Übung gehören (1 = einzeln). */
export function groupSize(items: readonly EditorItem[], index: number): number {
  const groupId = items[index]?.groupId;
  return groupId ? items.filter((item) => item.groupId === groupId).length : 1;
}
