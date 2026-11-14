/**
 * Belastung der Muskelgruppen: Sätze pro Woche, Trainingshäufigkeit, Verteilung auf Körperbereiche.
 */
import { MUSCLES, type Muscle } from "@/domain/exercises/types";
import { addDays, startOfWeek, type LocalDate } from "@/lib/dates";
import { BODY_AREAS, MUSCLE_AREA, type BodyArea, type ExerciseLookup, type TrainedSet } from "./types";

/** Ein Satz zählt für die Hauptmuskeln voll, für unterstützende Muskeln halb. */
export const SECONDARY_SET_SHARE = 0.5;

export type MuscleValues = Record<Muscle, number>;

export function emptyMuscleValues(): MuscleValues {
  return {
    chest: 0,
    lats: 0,
    upper_back: 0,
    traps: 0,
    lower_back: 0,
    front_delts: 0,
    side_delts: 0,
    rear_delts: 0,
    biceps: 0,
    triceps: 0,
    forearms: 0,
    abs: 0,
    obliques: 0,
    glutes: 0,
    quads: 0,
    hamstrings: 0,
    calves: 0,
    adductors: 0,
    abductors: 0,
  };
}

/** Aufwärmsätze und Sätze ohne Wiederholungen zählen nicht als Trainingsreiz. */
export function isCountingSet(set: TrainedSet): boolean {
  return set.type !== "warmup" && (set.reps ?? 0) > 0;
}

/** Anteil eines Satzes je Muskelgruppe (1 = Hauptmuskel, 0,5 = unterstützend). */
export function setShares(set: TrainedSet, lookup: ExerciseLookup): Partial<MuscleValues> {
  const exercise = lookup(set.exerciseId);
  if (!exercise || !isCountingSet(set)) return {};
  const shares: Partial<MuscleValues> = {};
  for (const muscle of exercise.primary) shares[muscle] = 1;
  for (const muscle of exercise.secondary) shares[muscle] ??= SECONDARY_SET_SHARE;
  return shares;
}

/** Summe der (anteiligen) Sätze je Muskelgruppe im Zeitraum, beide Grenzen eingeschlossen. */
export function setsPerMuscle(
  sets: readonly TrainedSet[],
  lookup: ExerciseLookup,
  from: LocalDate,
  to: LocalDate,
): MuscleValues {
  const totals = emptyMuscleValues();
  for (const set of sets) {
    if (set.date < from || set.date > to) continue;
    const shares = setShares(set, lookup);
    for (const muscle of MUSCLES) totals[muscle] += shares[muscle] ?? 0;
  }
  return totals;
}

export interface WeekLoad {
  /** Montag der Woche. */
  weekStart: LocalDate;
  sets: number;
}

/** Sätze einer Muskelgruppe für die letzten `weeks` Wochen, älteste zuerst. */
export function weeklySetsForMuscle(
  sets: readonly TrainedSet[],
  lookup: ExerciseLookup,
  muscle: Muscle,
  today: LocalDate,
  weeks: number,
): WeekLoad[] {
  const currentWeek = startOfWeek(today);
  return Array.from({ length: weeks }, (_, index) => {
    const weekStart = addDays(currentWeek, -7 * (weeks - 1 - index));
    const total = setsPerMuscle(sets, lookup, weekStart, addDays(weekStart, 6))[muscle];
    return { weekStart, sets: total };
  });
}

/** An wie vielen verschiedenen Tagen im Zeitraum eine Muskelgruppe als Hauptmuskel trainiert wurde. */
export function trainingDaysPerMuscle(
  sets: readonly TrainedSet[],
  lookup: ExerciseLookup,
  from: LocalDate,
  to: LocalDate,
): MuscleValues {
  const days = new Map<Muscle, Set<LocalDate>>();
  for (const set of sets) {
    if (set.date < from || set.date > to || !isCountingSet(set)) continue;
    for (const muscle of lookup(set.exerciseId)?.primary ?? []) {
      const dates = days.get(muscle) ?? new Set<LocalDate>();
      dates.add(set.date);
      days.set(muscle, dates);
    }
  }
  const result = emptyMuscleValues();
  for (const [muscle, dates] of days) result[muscle] = dates.size;
  return result;
}

/** Anteil der Sätze je Körperbereich (Summe 1; alles 0, wenn nichts trainiert wurde). */
export function areaDistribution(perMuscle: MuscleValues): Record<BodyArea, number> {
  const totals: Record<BodyArea, number> = { push: 0, pull: 0, core: 0, legs: 0 };
  for (const muscle of MUSCLES) totals[MUSCLE_AREA[muscle]] += perMuscle[muscle];
  const sum = BODY_AREAS.reduce((total, area) => total + totals[area], 0);
  if (sum === 0) return totals;
  for (const area of BODY_AREAS) totals[area] /= sum;
  return totals;
}

export interface ExerciseUsage {
  exerciseId: string;
  sets: number;
  sessions: number;
}

/** Meistgenutzte Übungen nach Anzahl der Sätze. */
export function mostUsedExercises(sets: readonly TrainedSet[], limit: number): ExerciseUsage[] {
  const usage = new Map<string, { sets: number; sessions: Set<string> }>();
  for (const set of sets) {
    if (!isCountingSet(set)) continue;
    const entry = usage.get(set.exerciseId) ?? { sets: 0, sessions: new Set<string>() };
    entry.sets++;
    entry.sessions.add(set.sessionId);
    usage.set(set.exerciseId, entry);
  }
  return [...usage.entries()]
    .map(([exerciseId, entry]) => ({ exerciseId, sets: entry.sets, sessions: entry.sessions.size }))
    .sort((a, b) => b.sets - a.sets || a.exerciseId.localeCompare(b.exerciseId))
    .slice(0, limit);
}
