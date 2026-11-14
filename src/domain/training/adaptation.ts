/**
 * Passt einen geplanten Tag an die aktuelle Lage an, ohne den Plan selbst zu ändern:
 * anderer Trainingsort, ausgeschlossene Übungen, Beschwerden (Verletztenmodus) und
 * die Kurzvariante im Zeitsparmodus.
 */
import type { Exercise } from "@/domain/exercises/types";
import { findAlternatives, isSuitable, type CandidateProfile } from "./plan-generator";
import {
  EXERCISE_SETUP_SECONDS,
  SET_WORK_SECONDS,
  WARMUP_SECONDS,
} from "./plan-generator/prescription";
import { groupConsecutive } from "./supersets";

export const SUBSTITUTION_REASONS = ["equipment", "excluded", "injury"] as const;
export type SubstitutionReason = (typeof SUBSTITUTION_REASONS)[number];

export interface DayEntry {
  exerciseId: string;
  sets: number;
  restSeconds: number;
  groupId: string | null;
}

export interface AdaptedEntry<T extends DayEntry> {
  entry: T;
  exercise: Exercise;
  /** Die ursprünglich geplante Übung, falls ersetzt wurde. */
  replaces: Exercise | null;
  reason: SubstitutionReason | null;
}

export interface AdaptedDay<T extends DayEntry> {
  items: AdaptedEntry<T>[];
  /** Übungen, für die es keinen Ersatz gab. */
  dropped: { exercise: Exercise; reason: SubstitutionReason }[];
}

function unsuitableReason(exercise: Exercise, profile: CandidateProfile): SubstitutionReason | null {
  if (profile.excludedExerciseIds.includes(exercise.id)) return "excluded";
  if (!isSuitable(exercise, { ...profile, excludedExerciseIds: [], equipment: exercise.equipment })) return "injury";
  if (!isSuitable(exercise, { ...profile, excludedExerciseIds: [], injuries: [] })) return "equipment";
  return null;
}

/**
 * Ersetzt Übungen, die gerade nicht passen, durch die beste Alternative (gleiches Bewegungsmuster
 * bzw. gleicher Hauptmuskel). Eigene Übungen und die Schwierigkeit bereits geplanter Übungen
 * bleiben unangetastet: Was der Nutzer selbst in den Plan gesetzt hat, gilt.
 */
export function adaptDay<T extends DayEntry>(
  entries: readonly T[],
  lookup: (exerciseId: string) => Exercise | null | undefined,
  catalog: readonly Exercise[],
  profile: CandidateProfile,
): AdaptedDay<T> {
  // Für geplante Übungen zählt die Schwierigkeit nicht mehr: nur Ort, Ausschluss und Beschwerden.
  const lenient: CandidateProfile = { ...profile, experience: "advanced" };
  const used = new Set(entries.map((entry) => entry.exerciseId));
  const items: AdaptedEntry<T>[] = [];
  const dropped: AdaptedDay<T>["dropped"] = [];

  for (const entry of entries) {
    const exercise = lookup(entry.exerciseId);
    if (!exercise) continue;
    const reason = unsuitableReason(exercise, lenient);
    if (!reason) {
      items.push({ entry, exercise, replaces: null, reason: null });
      continue;
    }
    const replacement = findAlternatives(exercise, catalog, {
      equipment: profile.equipment,
      excludedIds: [...used, ...profile.excludedExerciseIds],
      limit: catalog.length,
    }).find((candidate) => candidate.pattern !== "cardio" && isSuitable(candidate, profile));
    if (!replacement) {
      dropped.push({ exercise, reason });
      continue;
    }
    used.add(replacement.id);
    items.push({ entry: { ...entry, exerciseId: replacement.id }, exercise: replacement, replaces: exercise, reason });
  }
  return { items, dropped };
}

/**
 * Geschätzte Dauer eines Tages in Sekunden. In Supersätzen und Zirkeln fällt die Pause nur
 * einmal pro Durchgang an.
 */
export function estimateDaySeconds(entries: readonly DayEntry[]): number {
  let total = WARMUP_SECONDS;
  for (const group of groupConsecutive(entries)) {
    const rounds = Math.max(...group.items.map((item) => item.sets));
    const work = group.items.reduce((sum, item) => sum + item.sets * SET_WORK_SECONDS, 0);
    const rest = Math.max(...group.items.map((item) => item.restSeconds));
    total += group.items.length * EXERCISE_SETUP_SECONDS + work + Math.max(rounds - 1, 0) * rest;
  }
  return total;
}

/** Die Kurzvariante dauert etwa so viel der normalen Einheit. */
export const SHORT_SESSION_SHARE = 0.6;
const MIN_SHORT_SETS = 2;
const MIN_SHORT_EXERCISES = 3;

export interface ShortenInput<T extends DayEntry> {
  entry: T;
  exercise: Pick<Exercise, "mechanic" | "primary">;
}

/**
 * Zeitsparmodus: ein Satz weniger pro Übung, Isolationsübungen paarweise als Supersatz,
 * und vom Ende her so viele Übungen streichen, bis die Zielzeit erreicht ist.
 * Die Reihenfolge im Plan ist die Priorität: Die ersten Übungen bleiben.
 */
export function shortenDay<T extends DayEntry>(items: readonly ShortenInput<T>[], targetSeconds?: number): T[] {
  const target = targetSeconds ?? estimateDaySeconds(items.map((item) => item.entry)) * SHORT_SESSION_SHARE;
  const reduced = items.map((item) => ({
    ...item,
    entry: { ...item.entry, sets: Math.max(Math.min(item.entry.sets, MIN_SHORT_SETS), item.entry.sets - 1) },
  }));

  // Benachbarte Isolationsübungen ohne gemeinsamen Hauptmuskel werden zum Supersatz.
  let pairIndex = 0;
  for (let index = 0; index < reduced.length - 1; index++) {
    const first = reduced[index];
    const second = reduced[index + 1];
    const bothFree = first.entry.groupId === null && second.entry.groupId === null;
    const bothIsolation = first.exercise.mechanic === "isolation" && second.exercise.mechanic === "isolation";
    const overlap = first.exercise.primary.some((muscle) => second.exercise.primary.includes(muscle));
    if (!bothFree || !bothIsolation || overlap) continue;
    const groupId = `short-${++pairIndex}`;
    first.entry = { ...first.entry, groupId };
    second.entry = { ...second.entry, groupId };
    index++;
  }

  const result = reduced.map((item) => item.entry);
  while (result.length > MIN_SHORT_EXERCISES && estimateDaySeconds(result) > target) {
    const removed = result.pop();
    // Bleibt von einem Supersatz nur eine Übung übrig, ist sie wieder eine einzelne Übung.
    const last = result.at(-1);
    if (removed?.groupId && last && last.groupId === removed.groupId) {
      result[result.length - 1] = { ...last, groupId: null };
    }
  }
  return result;
}
