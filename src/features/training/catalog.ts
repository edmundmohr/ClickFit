import { EXERCISES, EXERCISES_BY_ID } from "@/data/exercises";
import type { Exercise } from "@/domain/exercises/types";

/** Zugriff auf die Übungsbibliothek. Eigene Übungen der Nutzer kommen später hier dazu. */
export function getCatalog(): readonly Exercise[] {
  return EXERCISES;
}

export function findExercise(id: string): Exercise | null {
  return EXERCISES_BY_ID.get(id) ?? null;
}
