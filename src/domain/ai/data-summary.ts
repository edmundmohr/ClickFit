/**
 * Verdichtet Rohdaten für die KI: Wochenwerte statt Tageslisten, je Übung erster und letzter
 * Stand. So bleibt die Anfrage klein, ohne dass Daten fehlen. Reine Funktionen ohne Framework.
 */
import { isCountingSet, setsPerMuscle } from "@/domain/progress/muscle-load";
import { detectPlateau, exerciseSeries, type SessionPoint } from "@/domain/progress/strength";
import type { ExerciseLookup, TrainedSet } from "@/domain/progress/types";
import { MUSCLES, type Muscle } from "@/domain/exercises/types";
import { addDays, diffDays, startOfWeek, type LocalDate } from "@/lib/dates";

export interface DatedValue {
  date: LocalDate;
  value: number;
}

export interface WeekSummary {
  /** Montag der Woche. */
  weekStart: LocalDate;
  /** Tage mit einem Wert. */
  days: number;
  average: number;
  total: number;
}

/**
 * Wochenwerte (Montag bis Sonntag) für die Wochen, die `from` bis `to` berühren, älteste zuerst.
 * Wochen ohne Wert fehlen; die Lücke ist für die KI selbst eine Aussage.
 */
export function weeklySummaries(values: readonly DatedValue[], from: LocalDate, to: LocalDate): WeekSummary[] {
  const weeks = new Map<LocalDate, DatedValue[]>();
  for (const entry of values) {
    if (entry.date < from || entry.date > to) continue;
    const week = startOfWeek(entry.date);
    weeks.set(week, [...(weeks.get(week) ?? []), entry]);
  }
  return [...weeks.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, entries]) => {
      const total = entries.reduce((sum, entry) => sum + entry.value, 0);
      return { weekStart, days: entries.length, average: total / entries.length, total };
    });
}

/** Bester Satz einer Einheit in knapper Form. */
export interface BestSetSummary {
  date: LocalDate;
  weightKg: number | null;
  reps: number;
  oneRepMaxKg: number | null;
  /** Nur unterstützte Übungen: geringste Unterstützung. */
  assistanceKg: number | null;
}

export interface ExerciseProgress {
  exerciseId: string;
  name: string;
  sessions: number;
  /** Arbeitssätze im Zeitraum. */
  sets: number;
  first: BestSetSummary;
  last: BestSetSummary;
  avgRir: number | null;
  /** Tage ohne Steigerung, wenn ein Plateau erkannt ist. */
  plateauDays: number | null;
}

function bestSet(point: SessionPoint): BestSetSummary {
  return {
    date: point.date,
    weightKg: point.bestWeightKg,
    reps: point.bestReps,
    oneRepMaxKg: point.oneRepMaxKg,
    assistanceKg: point.minAssistanceKg,
  };
}

/**
 * Fortschritt je Übung aus den Sätzen des Zeitraums. Das Plateau wird über `history` (längerer
 * Verlauf) erkannt, weil es mindestens sechs Einheiten braucht. Häufigste Übungen zuerst.
 */
export function exerciseProgress(
  sets: readonly TrainedSet[],
  history: readonly TrainedSet[],
  lookup: ExerciseLookup,
  limit: number,
): ExerciseProgress[] {
  const ids = [...new Set(sets.filter(isCountingSet).map((set) => set.exerciseId))];
  return ids
    .flatMap((exerciseId): ExerciseProgress[] => {
      const exercise = lookup(exerciseId);
      const series = exerciseSeries(sets, exerciseId, exercise?.type);
      const first = series.at(0);
      const last = series.at(-1);
      if (!first || !last) return [];
      const rirs = series.flatMap((point) => (point.avgRir === null ? [] : [point.avgRir]));
      const plateau = detectPlateau(exerciseSeries(history, exerciseId, exercise?.type));
      return [
        {
          exerciseId,
          name: exercise?.name ?? exerciseId,
          sessions: series.length,
          sets: series.reduce((total, point) => total + point.sets, 0),
          first: bestSet(first),
          last: bestSet(last),
          avgRir: rirs.length > 0 ? rirs.reduce((total, rir) => total + rir, 0) / rirs.length : null,
          plateauDays: plateau?.days ?? null,
        },
      ];
    })
    .sort((a, b) => b.sessions - a.sessions || b.sets - a.sets || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/** Durchschnittliche Arbeitssätze pro Woche und Muskelgruppe im Zeitraum (gerundet auf 0,5). */
export function weeklySetsPerMuscle(
  sets: readonly TrainedSet[],
  lookup: ExerciseLookup,
  from: LocalDate,
  to: LocalDate,
): Partial<Record<Muscle, number>> {
  const weeks = Math.max(1, (diffDays(from, to) + 1) / 7);
  const totals = setsPerMuscle(sets, lookup, from, to);
  const result: Partial<Record<Muscle, number>> = {};
  for (const muscle of MUSCLES) {
    if (totals[muscle] > 0) result[muscle] = Math.round((totals[muscle] / weeks) * 2) / 2;
  }
  return result;
}

/** Werte ab `days` Tagen vor `to`; hilft, Abschnitte des Zeitraums zu vergleichen. */
export function since<T extends { date: LocalDate }>(values: readonly T[], to: LocalDate, days: number): T[] {
  const from = addDays(to, -(days - 1));
  return values.filter((value) => value.date >= from && value.date <= to);
}
