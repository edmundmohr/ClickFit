/**
 * Regelbasierter Plan-Generator. Deterministisch: gleiche Eingaben ergeben immer denselben Plan.
 * Kein Zufall, kein Datum, kein Datenbankzugriff.
 */
import type { Difficulty, Equipment, Exercise, MovementPattern, Muscle } from "@/domain/exercises/types";
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
import {
  DELOAD_EVERY_WEEKS,
  MIN_SETS_PER_EXERCISE,
  WARMUP_SECONDS,
  estimateExerciseSeconds,
  estimateSessionSeconds,
  fillWithinBudget,
  prescribe,
  reduceSets,
} from "./prescription";
import { DAY_TEMPLATES, GRIP_DAY_ORDER, GRIP_DAYS_PER_WEEK, GRIP_SLOT, chooseSplit, type Slot } from "./templates";

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
function slotRank(exercise: Exercise, slot: Slot, preferences?: PreferenceMap): number {
  const mechanicMismatch = slot.kind === "compound" && exercise.mechanic !== "compound" ? 100 : 0;
  const specialty = exercise.priority === 3 ? 10 : 0;
  const unloaded = isUnloaded(exercise) && !CORE_PATTERNS.includes(exercise.pattern) ? 1 : 0;
  return mechanicMismatch + specialty + exercise.priority + unloaded + learnedOffset(preferences?.get(exercise.id));
}

/** Was der Generator über eine Übung gelernt hat. */
export interface ExercisePreference {
  /** In wie vielen Einheiten der letzten Wochen die Übung gemacht wurde. */
  usage: number;
  /** Wie oft ein Vorschlag mit dieser Übung getauscht oder gelöscht wurde. */
  rejections: number;
}
export type PreferenceMap = ReadonlyMap<string, ExercisePreference>;

export const FREQUENT_USAGE = 3;
const USAGE_BONUS = 0.5;
const REJECTION_PENALTY = 1.5;
const MAX_COUNTED_REJECTIONS = 2;

/**
 * Lernender Generator: Oft gemachte Übungen rücken unter gleich guten Kandidaten nach vorn,
 * abgelehnte Vorschläge nach hinten. Die Grundreihenfolge (Grundübung vor Spezialübung) bleibt.
 */
function learnedOffset(preference: ExercisePreference | undefined): number {
  if (!preference) return 0;
  // Wer eine Übung trotz früherer Ablehnung wieder regelmäßig macht, hat seine Meinung geändert.
  if (preference.usage >= FREQUENT_USAGE) return -USAGE_BONUS;
  return Math.min(preference.rejections, MAX_COUNTED_REJECTIONS) * REJECTION_PENALTY;
}

function compareForSlot(slot: Slot, preferences?: PreferenceMap) {
  return (a: Exercise, b: Exercise): number =>
    slotRank(a, slot, preferences) - slotRank(b, slot, preferences) ||
    Number(isUnloaded(a)) - Number(isUnloaded(b)) ||
    a.id.localeCompare(b.id);
}

function compareCandidates(a: Exercise, b: Exercise): number {
  return a.priority - b.priority || a.id.localeCompare(b.id);
}

export interface SelectionContext {
  candidates: readonly Exercise[];
  usedInWeek: ReadonlySet<string>;
  usedToday: ReadonlySet<string>;
  preferences?: PreferenceMap;
}

/**
 * Sucht die beste Übung für einen Slot. Für Abwechslung wird eine in dieser Woche noch nicht
 * genutzte Übung genommen – aber nur, wenn sie gleich gut ist. Sonst wiederholt sich lieber
 * die Standardübung, als dass eine deutlich schlechtere Variante im Plan landet.
 */
export function pickForSlot(slot: Slot, context: SelectionContext): Exercise | null {
  for (const pattern of slot.patterns) {
    const matching = context.candidates
      .filter(
        (exercise) =>
          exercise.pattern === pattern &&
          !context.usedToday.has(exercise.id) &&
          (!slot.muscles || slot.muscles.some((muscle) => exercise.primary.includes(muscle))),
      )
      .sort(compareForSlot(slot, context.preferences));
    const best = matching[0];
    if (!best) continue;
    const rank = (exercise: Exercise) => slotRank(exercise, slot, context.preferences);
    const fresh = matching.find((exercise) => !context.usedInWeek.has(exercise.id));
    return fresh && rank(fresh) === rank(best) ? fresh : best;
  }
  return null;
}

/**
 * Stellt einen Tag aus den Slots zusammen und hält das Zeitbudget immer ein. Passen mit den
 * vollen Sätzen weniger als drei Übungen hinein, wird pro Übung gekürzt (siehe `fillWithinBudget`).
 */
export function buildDay(
  slots: readonly Slot[],
  profile: Pick<TrainingProfile, "goal" | "experience" | "sessionMinutes">,
  candidates: readonly Exercise[],
  usedInWeek: Set<string>,
  preferences?: PreferenceMap,
): PlannedExercise[] {
  const budgetSeconds = profile.sessionMinutes * 60 - WARMUP_SECONDS;

  const fill = (reduceBy: number): PlannedExercise[] => {
    const usedToday = new Set<string>();
    // Eigene Kopie: Erst die gewählte Variante zählt für die Abwechslung in der Woche.
    const usedThisWeek = new Set(usedInWeek);
    const planned: PlannedExercise[] = [];
    let usedSeconds = 0;
    for (const slot of slots) {
      const exercise = pickForSlot(slot, { candidates, usedInWeek: usedThisWeek, usedToday, preferences });
      if (!exercise) continue;
      const entry = reduceSets(prescribe(exercise, slot.kind, profile.goal, profile.experience), reduceBy);
      const seconds = estimateExerciseSeconds(entry);
      if (usedSeconds + seconds > budgetSeconds) continue;
      planned.push(entry);
      usedToday.add(exercise.id);
      usedThisWeek.add(exercise.id);
      usedSeconds += seconds;
    }
    return planned;
  };

  const planned = fillWithinBudget(fill);
  for (const entry of planned) usedInWeek.add(entry.exerciseId);
  return planned;
}

export function sortWeekdays(weekdays: readonly Weekday[]): Weekday[] {
  return [...new Set(weekdays)].sort((a, b) => a - b);
}

/** Bewegungsmuster, die wegen der angegebenen Beschwerden gemieden werden. */
export function avoidedPatterns(injuries: readonly BodyRegion[]): Set<MovementPattern> {
  return new Set(injuries.flatMap((region) => PATTERNS_TO_AVOID[region]));
}

export type CandidateProfile = Pick<TrainingProfile, "equipment" | "excludedExerciseIds" | "injuries" | "experience">;

/** Ob eine Übung für den Nutzer in Frage kommt: Equipment, Ausschlüsse, Beschwerden, Schwierigkeit. */
export function isSuitable(exercise: Exercise, profile: CandidateProfile): boolean {
  return (
    !profile.excludedExerciseIds.includes(exercise.id) &&
    !avoidedPatterns(profile.injuries).has(exercise.pattern) &&
    DIFFICULTY_RANK[exercise.difficulty] <= EXPERIENCE_RANK[profile.experience] &&
    isExerciseAvailable(exercise, profile.equipment)
  );
}

/** Alle Kraftübungen, aus denen der Generator für diesen Nutzer wählen darf. */
export function filterCandidates(profile: CandidateProfile, catalog: readonly Exercise[]): Exercise[] {
  const avoided = avoidedPatterns(profile.injuries);
  const excluded = new Set(profile.excludedExerciseIds);
  const maxDifficulty = EXPERIENCE_RANK[profile.experience];
  return catalog.filter(
    (exercise) =>
      exercise.pattern !== "cardio" &&
      !excluded.has(exercise.id) &&
      !avoided.has(exercise.pattern) &&
      DIFFICULTY_RANK[exercise.difficulty] <= maxDifficulty &&
      isExerciseAvailable(exercise, profile.equipment),
  );
}

export interface GeneratorOptions {
  /** Gelernte Vorlieben je Übung. */
  preferences?: PreferenceMap;
  /** Griffkraft-Modul: ergänzt an zwei Tagen eine Griff- bzw. Unterarmübung. */
  includeGrip?: boolean;
  /** Beinlastige Zusatzsport-Einheiten pro Woche (Laufen, Radfahren, Fußball …). */
  legSportSessions?: number;
}

/** Ab so vielen beinlastigen Einheiten pro Woche gibt es bei Bein-Isolationsübungen einen Satz weniger. */
export const LEG_SPORT_THRESHOLD = 3;
const LEG_MUSCLES: readonly Muscle[] = ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"];

/** Mehr Sätze bekommt eine Schwerpunkt-Übung nicht, auch wenn noch Zeit wäre. */
export const MAX_FOCUS_SETS = 5;

/**
 * Schwerpunkt-Muskelgruppen: Übungen, die sie als Hauptmuskel trainieren, bekommen einen Satz
 * mehr – der Reihe nach und nur, solange die Einheit im Zeitbudget bleibt.
 */
function addFocusSets(
  day: PlannedDay,
  focusMuscles: readonly Muscle[],
  byId: ReadonlyMap<string, Exercise>,
  budgetSeconds: number,
): void {
  day.exercises.forEach((entry, index) => {
    const exercise = byId.get(entry.exerciseId);
    if (!exercise || entry.sets >= MAX_FOCUS_SETS) return;
    if (!exercise.primary.some((muscle) => focusMuscles.includes(muscle))) return;
    const boosted = day.exercises.map((item, position) =>
      position === index ? { ...item, sets: item.sets + 1 } : item,
    );
    if (estimateSessionSeconds(boosted) <= budgetSeconds) day.exercises = boosted;
  });
}

export function generatePlan(
  profile: TrainingProfile,
  catalog: readonly Exercise[],
  options: GeneratorOptions = {},
): GeneratedPlan {
  const weekdays = sortWeekdays(profile.weekdays);
  if (weekdays.length < MIN_TRAINING_DAYS || weekdays.length > MAX_TRAINING_DAYS) {
    throw new RangeError(`Training days must be between ${MIN_TRAINING_DAYS} and ${MAX_TRAINING_DAYS}.`);
  }
  const { split, days } = chooseSplit(weekdays.length, profile);
  const candidates = filterCandidates(profile, catalog);

  const usedInWeek = new Set<string>();
  const plannedDays: PlannedDay[] = days.map((focus, index) => ({
    focus,
    weekday: weekdays[index],
    exercises: buildDay(DAY_TEMPLATES[focus], profile, candidates, usedInWeek, options.preferences),
  }));

  const focusMuscles = profile.focusMuscles ?? [];
  if (focusMuscles.length > 0) {
    const byId = new Map(candidates.map((exercise) => [exercise.id, exercise]));
    for (const day of plannedDays) addFocusSets(day, focusMuscles, byId, profile.sessionMinutes * 60);
  }

  if (options.includeGrip) {
    // Die Tage mit Zug-Anteil zuerst; kurze Griffarbeit kommt ans Ende und zählt nicht ins Zeitbudget.
    const gripDays = [...plannedDays]
      .sort((a, b) => GRIP_DAY_ORDER.indexOf(a.focus) - GRIP_DAY_ORDER.indexOf(b.focus))
      .slice(0, GRIP_DAYS_PER_WEEK);
    for (const day of gripDays) {
      const usedToday = new Set(day.exercises.map((entry) => entry.exerciseId));
      const exercise = pickForSlot(GRIP_SLOT, { candidates, usedInWeek, usedToday, preferences: options.preferences });
      if (!exercise) continue;
      day.exercises.push(prescribe(exercise, GRIP_SLOT.kind, profile.goal, profile.experience));
      usedInWeek.add(exercise.id);
    }
  }

  if ((options.legSportSessions ?? 0) >= LEG_SPORT_THRESHOLD) {
    const byId = new Map(candidates.map((exercise) => [exercise.id, exercise]));
    for (const day of plannedDays) {
      day.exercises = day.exercises.map((entry) => {
        const exercise = byId.get(entry.exerciseId);
        const isLegIsolation =
          exercise?.mechanic === "isolation" && exercise.primary.every((muscle) => LEG_MUSCLES.includes(muscle));
        return isLegIsolation ? { ...entry, sets: Math.max(MIN_SETS_PER_EXERCISE, entry.sets - 1) } : entry;
      });
    }
  }

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
