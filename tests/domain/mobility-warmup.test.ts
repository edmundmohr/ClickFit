import { describe, expect, it } from "vitest";
import { MOBILITY_EXERCISES_BY_ID, WARMUP_EXERCISES } from "@/data/mobility";
import { WARMUP_EXERCISE_IDS } from "@/data/mobility/warmup";
import { MOVEMENT_PATTERNS, type MovementPattern } from "@/domain/exercises/types";
import {
  PATTERN_REGIONS,
  WARMUP_HOLD_SECONDS,
  WARMUP_MAX_EXERCISES,
  WARMUP_MAX_REPS,
  buildWarmup,
  regionNeeds,
} from "@/domain/mobility/warmup";

function regionsOf(patterns: MovementPattern[]): string[] {
  const warmup = buildWarmup(patterns, WARMUP_EXERCISES);
  return (warmup?.items ?? []).flatMap((item) => MOBILITY_EXERCISES_BY_ID.get(item.exerciseId)?.regions ?? []);
}

describe("warm-up pool", () => {
  it("only names exercises of the catalog, each once", () => {
    expect(WARMUP_EXERCISES).toHaveLength(WARMUP_EXERCISE_IDS.length);
    expect(new Set(WARMUP_EXERCISE_IDS).size).toBe(WARMUP_EXERCISE_IDS.length);
  });

  it("covers every region a movement pattern can ask for", () => {
    const covered = new Set(WARMUP_EXERCISES.flatMap((exercise) => exercise.regions));
    for (const pattern of MOVEMENT_PATTERNS) {
      for (const region of PATTERN_REGIONS[pattern]) expect(covered).toContain(region);
    }
  });
});

describe("regionNeeds", () => {
  it("weights early exercises and the main region of a pattern highest", () => {
    const needs = regionNeeds(["squat", "horizontal_push"]);
    expect(needs.get("hips")).toBe(9);
    expect(needs.get("ankles")).toBe(6);
    expect(needs.get("shoulders")).toBe(6);
    expect(needs.get("wrists")).toBe(2);
  });
});

describe("buildWarmup", () => {
  it("mobilizes the hips for a leg day and leaves the shoulders alone", () => {
    const regions = regionsOf(["squat", "hinge", "lunge", "knee_flexion", "calf_raise"]);
    expect(regions).toContain("hips");
    expect(regions).toContain("ankles");
    expect(regions).not.toContain("neck");
    expect(regions).not.toContain("wrists");
  });

  it("mobilizes shoulders and thoracic spine for an upper day", () => {
    const warmup = buildWarmup(["horizontal_push", "horizontal_pull", "vertical_push", "elbow_flexion"], WARMUP_EXERCISES);
    expect(warmup?.regions[0]).toBe("shoulders");
    const primary = warmup?.items.map((item) => MOBILITY_EXERCISES_BY_ID.get(item.exerciseId)?.regions[0]);
    expect(primary).toContain("shoulders");
    expect(primary).toContain("thoracic_spine");
    expect(primary).not.toContain("hips");
  });

  it("covers both halves on a full-body day", () => {
    const regions = regionsOf(["squat", "horizontal_push", "horizontal_pull", "hinge"]);
    expect(regions).toContain("hips");
    expect(regions).toContain("shoulders");
  });

  it("stays short: few exercises, short holds, few repetitions", () => {
    for (const pattern of MOVEMENT_PATTERNS) {
      const warmup = buildWarmup([pattern, "squat", "vertical_pull"], WARMUP_EXERCISES);
      expect(warmup?.items.length).toBeLessThanOrEqual(WARMUP_MAX_EXERCISES);
      for (const item of warmup?.items ?? []) {
        if (item.durationSeconds !== undefined) expect(item.durationSeconds).toBeLessThanOrEqual(WARMUP_HOLD_SECONDS);
        if (item.reps !== undefined) expect(item.reps).toBeLessThanOrEqual(WARMUP_MAX_REPS);
      }
    }
  });

  it("never repeats an exercise and is deterministic", () => {
    const patterns: MovementPattern[] = ["squat", "hinge", "hip_thrust", "hip_abduction"];
    const first = buildWarmup(patterns, WARMUP_EXERCISES);
    const ids = first?.items.map((item) => item.exerciseId) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
    expect(buildWarmup(patterns, WARMUP_EXERCISES)).toEqual(first);
  });

  it("offers nothing when the day has no matching region", () => {
    expect(buildWarmup(["cardio"], WARMUP_EXERCISES)).toBeNull();
    expect(buildWarmup([], WARMUP_EXERCISES)).toBeNull();
    expect(buildWarmup(["squat"], [])).toBeNull();
  });
});
