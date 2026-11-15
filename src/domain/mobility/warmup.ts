/**
 * Warm-up vor dem Krafttraining: wählt Mobility-Übungen für die Körperbereiche, die der
 * Trainingstag belastet. Ohne Framework, ohne Zufall – gleicher Tag, gleiches Warm-up.
 */
import type { MovementPattern } from "@/domain/exercises/types";
import { DEFAULT_REP_SECONDS, STEP_SWITCH_SECONDS } from "./routines";
import type { MobilityExercise, MobilityRegion, MobilityRoutineItem } from "./types";

/** Welche Gelenke und Bereiche ein Bewegungsmuster braucht; der erste Eintrag ist der wichtigste. */
export const PATTERN_REGIONS: Record<MovementPattern, readonly MobilityRegion[]> = {
  horizontal_push: ["shoulders", "thoracic_spine", "wrists"],
  vertical_push: ["shoulders", "thoracic_spine", "wrists"],
  chest_fly: ["shoulders", "thoracic_spine"],
  horizontal_pull: ["thoracic_spine", "shoulders"],
  vertical_pull: ["shoulders", "thoracic_spine"],
  shoulder_raise: ["shoulders"],
  rear_delt: ["shoulders", "thoracic_spine"],
  shrug: ["neck", "shoulders"],
  elbow_flexion: ["wrists"],
  elbow_extension: ["wrists", "shoulders"],
  squat: ["hips", "ankles", "knees"],
  hinge: ["hips", "hamstrings", "lower_back"],
  lunge: ["hips", "ankles", "knees"],
  hip_thrust: ["hips"],
  knee_extension: ["knees"],
  knee_flexion: ["hamstrings", "knees"],
  hip_abduction: ["hips"],
  hip_adduction: ["hips"],
  calf_raise: ["ankles"],
  core_flexion: ["lower_back"],
  core_stability: ["lower_back"],
  core_rotation: ["thoracic_spine"],
  back_extension: ["lower_back", "hips"],
  carry: ["shoulders", "wrists"],
  grip: ["wrists"],
  cardio: [],
};

/** Vor dem Training wird nur kurz gehalten; lange Dehnungen gehören in eine eigene Routine. */
export const WARMUP_HOLD_SECONDS = 20;
export const WARMUP_MAX_REPS = 8;
export const WARMUP_MAX_EXERCISES = 5;
/** Ab dieser Dauer kommt keine weitere Übung dazu. */
export const WARMUP_TARGET_SECONDS = 300;

/** Die ersten Übungen des Tages sind die schweren: Sie zählen am stärksten. */
const ORDER_WEIGHTS = [3, 2];
const DEFAULT_ORDER_WEIGHT = 1;
/** Gewicht der Regionen eines Musters nach ihrer Stelle in `PATTERN_REGIONS`. */
const REGION_RANK_WEIGHTS = [3, 2, 1];
const SECONDARY_REGION_FACTOR = 0.5;
/** Bewegte Übungen bereiten besser vor als gehaltene. */
const DYNAMIC_BONUS = 1.5;
/** So viel Bedarf bleibt in einer Region, nachdem eine Übung sie abgedeckt hat. */
const COVERED_PRIMARY = 0.3;
const COVERED_SECONDARY = 0.6;
/** Übungen, die weniger als diesen Anteil des größten Bedarfs abdecken, lohnen sich nicht mehr. */
const MIN_SCORE_SHARE = 0.15;

export interface Warmup {
  /** Übungen in Reihenfolge, mit gekürzter Dauer bzw. Wiederholungszahl. */
  items: MobilityRoutineItem[];
  /** Abgedeckte Regionen des Trainingstags, die wichtigste zuerst. */
  regions: MobilityRegion[];
}

/** Bedarf je Region aus den Bewegungsmustern des Tages (in Trainingsreihenfolge). */
export function regionNeeds(patterns: readonly MovementPattern[]): Map<MobilityRegion, number> {
  const needs = new Map<MobilityRegion, number>();
  patterns.forEach((pattern, position) => {
    const orderWeight = ORDER_WEIGHTS[position] ?? DEFAULT_ORDER_WEIGHT;
    PATTERN_REGIONS[pattern].forEach((region, rank) => {
      const weight = orderWeight * (REGION_RANK_WEIGHTS[rank] ?? 1);
      needs.set(region, (needs.get(region) ?? 0) + weight);
    });
  });
  return needs;
}

function toItem(exercise: MobilityExercise): MobilityRoutineItem {
  return exercise.durationSeconds !== undefined
    ? { exerciseId: exercise.id, durationSeconds: Math.min(exercise.durationSeconds, WARMUP_HOLD_SECONDS) }
    : { exerciseId: exercise.id, reps: Math.min(exercise.reps, WARMUP_MAX_REPS) };
}

function itemSeconds(exercise: MobilityExercise, item: MobilityRoutineItem): number {
  const once = item.durationSeconds ?? (item.reps ?? 0) * (exercise.repSeconds ?? DEFAULT_REP_SECONDS);
  const sides = exercise.perSide ? 2 : 1;
  return sides * (once + STEP_SWITCH_SECONDS);
}

function score(exercise: MobilityExercise, needs: ReadonlyMap<MobilityRegion, number>): number {
  const covered = exercise.regions.reduce(
    (total, region, index) => total + (needs.get(region) ?? 0) * (index === 0 ? 1 : SECONDARY_REGION_FACTOR),
    0,
  );
  return exercise.durationSeconds === undefined ? covered * DYNAMIC_BONUS : covered;
}

/**
 * Stellt aus den erlaubten Mobility-Übungen (`pool`) ein Warm-up für den Trainingstag zusammen.
 * Schrittweise kommt die Übung dazu, die den größten offenen Bedarf deckt; danach sinkt der
 * Bedarf ihrer Regionen, damit die nächste Übung einen anderen Bereich erwischt.
 * Ohne passende Übung (z. B. reiner Cardio-Tag) ist das Ergebnis `null`.
 */
export function buildWarmup(patterns: readonly MovementPattern[], pool: readonly MobilityExercise[]): Warmup | null {
  const initial = regionNeeds(patterns);
  const needs = new Map(initial);
  const threshold = Math.max(0, ...initial.values()) * MIN_SCORE_SHARE;
  const remaining = [...pool];
  const items: MobilityRoutineItem[] = [];
  let seconds = 0;

  while (items.length < WARMUP_MAX_EXERCISES && seconds < WARMUP_TARGET_SECONDS) {
    let best: MobilityExercise | null = null;
    let bestScore = threshold;
    // Bei Gleichstand gewinnt die frühere Übung im Katalog.
    for (const exercise of remaining) {
      const value = score(exercise, needs);
      if (value > bestScore) {
        best = exercise;
        bestScore = value;
      }
    }
    if (!best) break;
    const item = toItem(best);
    items.push(item);
    seconds += itemSeconds(best, item);
    remaining.splice(remaining.indexOf(best), 1);
    best.regions.forEach((region, index) => {
      const need = needs.get(region);
      if (need !== undefined) needs.set(region, need * (index === 0 ? COVERED_PRIMARY : COVERED_SECONDARY));
    });
  }

  if (items.length === 0) return null;
  const regions = [...initial.entries()].sort((a, b) => b[1] - a[1]).map(([region]) => region);
  return { items, regions };
}
