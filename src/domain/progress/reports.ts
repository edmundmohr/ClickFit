/**
 * Monatsbericht und Jahresrückblick: Kennzahlen eines Zeitraums.
 */
import type { LocalDate } from "@/lib/dates";
import { isCountingSet, mostUsedExercises, type ExerciseUsage } from "./muscle-load";
import { exerciseSeries } from "./strength";
import type { TrainedSet } from "./types";

export interface PeriodSession {
  id: string;
  date: LocalDate;
  durationMinutes: number | null;
}

export interface PeriodReport {
  workouts: number;
  trainingDays: number;
  totalMinutes: number;
  sets: number;
  volumeKg: number;
  /** Übungen, deren bestes geschätztes 1RM im Zeitraum über dem bisherigen Bestwert liegt. */
  improvedExercises: string[];
  topExercises: ExerciseUsage[];
  /** Monat (1–12) mit den meisten Einheiten; `null`, wenn es keine gab. */
  busiestMonth: number | null;
}

const TOP_EXERCISES = 3;

/**
 * Wertet einen Zeitraum aus. `allSets` enthält auch frühere Sätze, damit sich feststellen
 * lässt, welche Bestwerte neu sind.
 */
export function periodReport(
  sessions: readonly PeriodSession[],
  allSets: readonly TrainedSet[],
  from: LocalDate,
  to: LocalDate,
): PeriodReport {
  const inPeriod = sessions.filter((session) => session.date >= from && session.date <= to);
  const periodSets = allSets.filter((set) => set.date >= from && set.date <= to && isCountingSet(set));

  const improvedExercises: string[] = [];
  for (const exerciseId of new Set(periodSets.map((set) => set.exerciseId))) {
    const series = exerciseSeries(allSets, exerciseId).filter((point) => point.oneRepMaxKg !== null);
    const best = (points: typeof series) => Math.max(0, ...points.map((point) => point.oneRepMaxKg ?? 0));
    const before = series.filter((point) => point.date < from);
    const during = series.filter((point) => point.date >= from && point.date <= to);
    if (before.length > 0 && during.length > 0 && best(during) > best(before)) improvedExercises.push(exerciseId);
  }

  const perMonth = new Map<number, number>();
  for (const session of inPeriod) {
    const month = Number(session.date.slice(5, 7));
    perMonth.set(month, (perMonth.get(month) ?? 0) + 1);
  }
  const busiest = [...perMonth.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];

  return {
    workouts: inPeriod.length,
    trainingDays: new Set(inPeriod.map((session) => session.date)).size,
    totalMinutes: inPeriod.reduce((total, session) => total + (session.durationMinutes ?? 0), 0),
    sets: periodSets.length,
    volumeKg: periodSets.reduce((total, set) => total + (set.weightKg ?? 0) * (set.reps ?? 0), 0),
    improvedExercises: improvedExercises.sort(),
    topExercises: mostUsedExercises(periodSets, TOP_EXERCISES),
    busiestMonth: busiest ? busiest[0] : null,
  };
}
