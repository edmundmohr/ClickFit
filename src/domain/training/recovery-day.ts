/**
 * Erholungsorientierter Modus: statt eines festen Splits stellt die App den Tag aus den
 * Muskelgruppen zusammen, die gerade am besten erholt sind.
 */
import { MUSCLES, type Exercise, type Muscle } from "@/domain/exercises/types";
import { filterCandidates, pickForSlot, type PreferenceMap } from "./plan-generator";
import { WARMUP_SECONDS, estimateExerciseSeconds, prescribe } from "./plan-generator/prescription";
import { RECOVERY_SLOTS } from "./plan-generator/templates";
import type { PlannedExercise, TrainingProfile } from "./types";

/** Unter diesem Wert gilt eine Muskelgruppe als noch nicht bereit. */
export const READY_PERCENT = 70;
const MIN_EXERCISES = 3;
/** Mehr Übungen werden auch dann nicht geplant, wenn die Zeit reichen würde. */
const MAX_EXERCISES = 8;
const FOCUS_MUSCLES = 4;
/** Erholungswerte innerhalb einer Stufe gelten als gleich gut: Dann entscheidet die Wichtigkeit der Übung. */
const READINESS_BAND = 15;

export interface RecoveryDay {
  exercises: PlannedExercise[];
  /** Die Muskelgruppen, auf die der Tag zielt (frischeste zuerst). */
  focus: Muscle[];
  /** Es ist zu wenig erholt: lieber Pause oder nur lockere Bewegung. */
  restRecommended: boolean;
}

/** Bereitschaft einer Übung: die am wenigsten erholte beteiligte Hauptmuskelgruppe zählt. */
export function readiness(exercise: Pick<Exercise, "primary">, recovery: Record<Muscle, number>): number {
  if (exercise.primary.length === 0) return 100;
  return Math.min(...exercise.primary.map((muscle) => recovery[muscle]));
}

function band(ready: number): number {
  return Math.floor(Math.min(ready, 99) / READINESS_BAND);
}

export function buildRecoveryDay(
  recovery: Record<Muscle, number>,
  profile: TrainingProfile,
  catalog: readonly Exercise[],
  preferences?: PreferenceMap,
): RecoveryDay {
  const candidates = filterCandidates(profile, catalog);
  const usedToday = new Set<string>();
  const none = new Set<string>();

  // Für jede Slot-Art die beste Übung bestimmen und nach Erholung ordnen. Die Reihenfolge der
  // Slots (Grundübungen zuerst) entscheidet bei gleicher Erholung.
  const options = RECOVERY_SLOTS.flatMap((slot, order) => {
    const exercise = pickForSlot(slot, { candidates, usedInWeek: none, usedToday: none, preferences });
    return exercise ? [{ slot, order, exercise, ready: readiness(exercise, recovery) }] : [];
  }).sort((a, b) => band(b.ready) - band(a.ready) || a.order - b.order);

  const budgetSeconds = profile.sessionMinutes * 60 - WARMUP_SECONDS;
  const exercises: PlannedExercise[] = [];
  const chosen: Exercise[] = [];
  let usedSeconds = 0;
  for (const option of options) {
    if (exercises.length >= MAX_EXERCISES) break;
    if (usedToday.has(option.exercise.id)) continue;
    if (option.ready < READY_PERCENT && exercises.length >= MIN_EXERCISES) break;
    const entry = prescribe(option.exercise, option.slot.kind, profile.goal, profile.experience);
    const seconds = estimateExerciseSeconds(entry);
    if (usedSeconds + seconds > budgetSeconds && exercises.length >= MIN_EXERCISES) continue;
    exercises.push(entry);
    chosen.push(option.exercise);
    usedToday.add(option.exercise.id);
    usedSeconds += seconds;
  }

  // Grundübungen an den Anfang: Sie brauchen die meiste Frische.
  const order = new Map(chosen.map((exercise, index) => [exercise.id, { exercise, index }]));
  exercises.sort((a, b) => {
    const first = order.get(a.exerciseId);
    const second = order.get(b.exerciseId);
    if (!first || !second) return 0;
    return (
      Number(second.exercise.mechanic === "compound") - Number(first.exercise.mechanic === "compound") ||
      first.index - second.index
    );
  });

  const trained = new Set(chosen.flatMap((exercise) => exercise.primary));
  const focus = MUSCLES.filter((muscle) => trained.has(muscle))
    .sort((a, b) => recovery[b] - recovery[a])
    .slice(0, FOCUS_MUSCLES);
  const bestReady = options[0]?.ready ?? 0;
  return { exercises, focus, restRecommended: bestReady < READY_PERCENT };
}
