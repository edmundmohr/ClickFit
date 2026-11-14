/**
 * Regelbasierter Plan-Generator. Deterministisch: gleiche Eingaben ergeben immer denselben Plan.
 * Kein Zufall, kein Datum, kein Datenbankzugriff.
 */
import type { Difficulty, Equipment, Exercise, MovementPattern } from "@/domain/exercises/types";
import type {
  BodyRegion,
  ExperienceLevel,
  GeneratedPlan,
  PlannedDay,
  PlannedExercise,
  TrainingProfile,
  Weekday,
} from "../types";
import { MAX_TRAINING_DAYS, MIN_TRAINING_DAYS } from "../types";
import { DELOAD_EVERY_WEEKS, WARMUP_SECONDS, estimateExerciseSeconds, prescribe } from "./prescription";
import { DAY_TEMPLATES, SPLIT_BY_DAYS, type Slot } from "./templates";

const MIN_EXERCISES_PER_DAY = 3;
const DIFFICULTY_RANK: Record<Difficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };
const EXPERIENCE_RANK: Record<ExperienceLevel, number> = { beginner: 0, intermediate: 1, advanced: 2 };

/** Bewegungsmuster, die bei Beschwerden in einer Körperregion gemieden werden. */
export const PATTERNS_TO_AVOID: Record<BodyRegion, MovementPattern[]> = {
  shoulder: ["vertical_push", "shoulder_raise"],
  elbow: ["elbow_extension", "elbow_flexion"],
  wrist: ["grip"],
  lower_back: ["hinge", "back_extension"],
  hip: ["hip_thrust", "hip_abduction", "hip_adduction"],
  knee: ["lunge", "knee_extension"],
  ankle: ["calf_raise"],
  neck: ["shrug"],
};

export function isExerciseAvailable(exercise: Exercise, equipment: readonly Equipment[]): boolean {
  return exercise.equipment.every((item) => equipment.includes(item));
}

/** Übungen mit Gewicht lassen sich feiner steigern und haben Vorrang, wenn das Equipment da ist. */
function isUnloaded(exercise: Exercise): boolean {
  return exercise.type === "bodyweight_reps" || exercise.type === "duration";
}

const CORE_PATTERNS: MovementPattern[] = ["core_flexion", "core_stability", "core_rotation"];

/**
 * Rang eines Kandidaten für einen Slot (kleiner ist besser):
 * - Grundübungs-Slots bevorzugen Mehrgelenksübungen.
 * - Spezialübungen (Priorität 3) kommen nur zum Zug, wenn es nichts anderes gibt.
 * - Sonst zählt die Priorität aus dem Katalog. Übungen ohne Gewicht zählen eine Stufe
 *   schlechter, damit im Studio nicht das Widerstandsband vor dem Gerät gewählt wird.
 *   Für Bauchübungen gilt das nicht: Plank und Crunch sind dort erste Wahl.
 */
function slotRank(exercise: Exercise, slot: Slot): number {
  const mechanicMismatch = slot.kind === "compound" && exercise.mechanic !== "compound" ? 100 : 0;
  const specialty = exercise.priority === 3 ? 10 : 0;
  const unloaded = isUnloaded(exercise) && !CORE_PATTERNS.includes(exercise.pattern) ? 1 : 0;
  return mechanicMismatch + specialty + exercise.priority + unloaded;
}

function compareForSlot(slot: Slot) {
  return (a: Exercise, b: Exercise): number =>
    slotRank(a, slot) - slotRank(b, slot) ||
    Number(isUnloaded(a)) - Number(isUnloaded(b)) ||
    a.id.localeCompare(b.id);
}

function compareCandidates(a: Exercise, b: Exercise): number {
  return a.priority - b.priority || a.id.localeCompare(b.id);
}

interface SelectionContext {
  candidates: Exercise[];
  usedInWeek: Set<string>;
  usedToday: Set<string>;
}

/**
 * Sucht die beste Übung für einen Slot. Für Abwechslung wird eine in dieser Woche noch nicht
 * genutzte Übung genommen – aber nur, wenn sie gleich gut ist. Sonst wiederholt sich lieber
 * die Standardübung, als dass eine deutlich schlechtere Variante im Plan landet.
 */
function pickForSlot(slot: Slot, context: SelectionContext): Exercise | null {
  for (const pattern of slot.patterns) {
    const matching = context.candidates
      .filter(
        (exercise) =>
          exercise.pattern === pattern &&
          !context.usedToday.has(exercise.id) &&
          (!slot.muscles || slot.muscles.some((muscle) => exercise.primary.includes(muscle))),
      )
      .sort(compareForSlot(slot));
    const best = matching[0];
    if (!best) continue;
    const fresh = matching.find((exercise) => !context.usedInWeek.has(exercise.id));
    return fresh && slotRank(fresh, slot) === slotRank(best, slot) ? fresh : best;
  }
  return null;
}

function buildDay(
  slots: Slot[],
  profile: TrainingProfile,
  candidates: Exercise[],
  usedInWeek: Set<string>,
): PlannedExercise[] {
  const budgetSeconds = profile.sessionMinutes * 60 - WARMUP_SECONDS;
  const usedToday = new Set<string>();
  const planned: PlannedExercise[] = [];
  let usedSeconds = 0;

  for (const slot of slots) {
    const exercise = pickForSlot(slot, { candidates, usedInWeek, usedToday });
    if (!exercise) continue;
    const entry = prescribe(exercise, slot.kind, profile.goal, profile.experience);
    const seconds = estimateExerciseSeconds(entry);
    const fits = usedSeconds + seconds <= budgetSeconds;
    if (!fits && planned.length >= MIN_EXERCISES_PER_DAY) continue;
    planned.push(entry);
    usedToday.add(exercise.id);
    usedInWeek.add(exercise.id);
    usedSeconds += seconds;
  }
  return planned;
}

export function sortWeekdays(weekdays: readonly Weekday[]): Weekday[] {
  return [...new Set(weekdays)].sort((a, b) => a - b);
}

export function generatePlan(profile: TrainingProfile, catalog: readonly Exercise[]): GeneratedPlan {
  const weekdays = sortWeekdays(profile.weekdays);
  if (weekdays.length < MIN_TRAINING_DAYS || weekdays.length > MAX_TRAINING_DAYS) {
    throw new RangeError(`Training days must be between ${MIN_TRAINING_DAYS} and ${MAX_TRAINING_DAYS}.`);
  }
  const { split, days } = SPLIT_BY_DAYS[weekdays.length];
  const avoided = new Set(profile.injuries.flatMap((region) => PATTERNS_TO_AVOID[region]));
  const excluded = new Set(profile.excludedExerciseIds);
  const maxDifficulty = EXPERIENCE_RANK[profile.experience];

  const candidates = catalog.filter(
    (exercise) =>
      exercise.pattern !== "cardio" &&
      !excluded.has(exercise.id) &&
      !avoided.has(exercise.pattern) &&
      DIFFICULTY_RANK[exercise.difficulty] <= maxDifficulty &&
      isExerciseAvailable(exercise, profile.equipment),
  );

  const usedInWeek = new Set<string>();
  const plannedDays: PlannedDay[] = days.map((focus, index) => ({
    focus,
    weekday: weekdays[index],
    exercises: buildDay(DAY_TEMPLATES[focus], profile, candidates, usedInWeek),
  }));

  return { split, deloadEveryWeeks: DELOAD_EVERY_WEEKS[profile.experience], days: plannedDays };
}

/**
 * Alternativen zum Tauschen: gleiches Bewegungsmuster oder gleicher Hauptmuskel,
 * mit dem vorhandenen Equipment machbar. Beste Treffer zuerst.
 */
export function findAlternatives(
  exercise: Exercise,
  catalog: readonly Exercise[],
  options: { equipment?: readonly Equipment[]; excludedIds?: readonly string[]; limit?: number } = {},
): Exercise[] {
  const excluded = new Set([exercise.id, ...(options.excludedIds ?? [])]);
  const score = (candidate: Exercise): number => {
    const samePattern = candidate.pattern === exercise.pattern ? 4 : 0;
    const sharedPrimary = candidate.primary.filter((muscle) => exercise.primary.includes(muscle)).length;
    const sameMechanic = candidate.mechanic === exercise.mechanic ? 1 : 0;
    return samePattern + sharedPrimary * 2 + sameMechanic;
  };
  return catalog
    .filter(
      (candidate) =>
        !excluded.has(candidate.id) &&
        candidate.primary.some((muscle) => exercise.primary.includes(muscle)) &&
        (!options.equipment || isExerciseAvailable(candidate, options.equipment)),
    )
    .sort((a, b) => score(b) - score(a) || compareCandidates(a, b))
    .slice(0, options.limit ?? 8);
}
