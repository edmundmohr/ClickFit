import { describe, expect, it } from "vitest";
import { EXERCISES, EXERCISES_BY_ID } from "@/data/exercises";
import type { Exercise } from "@/domain/exercises/types";
import {
  effectiveBodyWeight,
  oneRepMaxShare,
  rawStartWeightKg,
  startRatio,
  startWeightKg,
  type StartAthlete,
} from "@/domain/training/start-weight";
import { START_RATIOS } from "@/domain/training/start-weight-table";
import { createLadder, ladderFor } from "@/domain/training/weights";

const man: StartAthlete = {
  sex: "male",
  ageYears: 35,
  bodyWeightKg: 80,
  experience: "intermediate",
  goal: "muscle_gain",
  injuries: [],
};
const prescription = { repMax: 10, targetRir: 2 };
const kgContext = { defaultUnit: "kg" as const, rules: [], bar: null };

function exercise(id: string): Exercise {
  const found = EXERCISES_BY_ID.get(id);
  if (!found) throw new Error(`Übung ${id} fehlt`);
  return found;
}

function start(id: string, athlete: StartAthlete = man) {
  const item = exercise(id);
  return startWeightKg(item, athlete, prescription, ladderFor(item.equipment, kgContext));
}

describe("start weight table", () => {
  it("has a value for every catalog exercise with external weight and nothing else", () => {
    const weighted = EXERCISES.filter((item) => item.type === "weight_reps").map((item) => item.id);
    expect(weighted.filter((id) => START_RATIOS[id] === undefined)).toEqual([]);
    expect(Object.keys(START_RATIOS).filter((id) => !EXERCISES_BY_ID.has(id))).toEqual([]);
  });

  it("estimates own exercises by pattern and equipment", () => {
    const own = { id: "own-press", type: "weight_reps" as const, pattern: "horizontal_push" as const };
    expect(startRatio({ ...own, equipment: ["machine"] })).toBeCloseTo(0.45);
    expect(startRatio({ ...own, equipment: ["dumbbell", "bench"] })).toBeCloseTo(0.18);
  });
});

describe("start weight", () => {
  it("lands in a careful but useful range for the main lifts", () => {
    expect(start("barbell-back-squat")).toBe(70);
    expect(start("barbell-bench-press")).toBe(47.5);
    expect(start("deadlift")).toBe(92.5);
    expect(start("dumbbell-lateral-raise")).toBe(8);
    const beginner = { ...man, experience: "beginner" as const };
    expect(start("barbell-bench-press", beginner)).toBe(25);
    expect(start("goblet-squat", beginner)).toBe(18);
  });

  it("works from the upper rep target plus reserve and stays below the estimate", () => {
    expect(oneRepMaxShare(12)).toBeCloseTo(1 / 1.4);
    const raw = rawStartWeightKg(exercise("barbell-bench-press"), man, prescription);
    expect(start("barbell-bench-press")).toBeLessThanOrEqual(raw * 1.1);
    // Mehr Wiederholungen oder mehr Reserve: leichter.
    expect(rawStartWeightKg(exercise("barbell-bench-press"), man, { repMax: 15, targetRir: 3 })).toBeLessThan(raw);
  });

  it("is lighter for beginners, women, older people, injuries and a diet", () => {
    const raw = (athlete: StartAthlete, id = "barbell-back-squat") => rawStartWeightKg(exercise(id), athlete, prescription);
    const base = raw(man);
    expect(raw({ ...man, experience: "beginner" })).toBeLessThan(base);
    expect(raw({ ...man, experience: "advanced" })).toBeGreaterThan(base);
    expect(raw({ ...man, sex: "female" })).toBeLessThan(base);
    // Frauen unten verhältnismäßig stärker als oben.
    expect(raw({ ...man, sex: "female" }) / base).toBeGreaterThan(
      raw({ ...man, sex: "female" }, "barbell-bench-press") / raw(man, "barbell-bench-press"),
    );
    expect(raw({ ...man, ageYears: 62 })).toBeLessThan(base);
    expect(raw({ ...man, injuries: ["knee"] })).toBeLessThan(base);
    // Eine Schulter-Beschwerde betrifft die Kniebeuge nicht.
    expect(raw({ ...man, injuries: ["shoulder"] })).toBe(base);
    expect(raw({ ...man, goal: "fat_loss" })).toBeLessThan(base);
  });

  it("does not scale strength linearly with high body weight", () => {
    expect(effectiveBodyWeight(70)).toBe(70);
    expect(effectiveBodyWeight(120)).toBe(105);
  });

  it("starts with the empty bar or leaves it to the user when the bar is too heavy", () => {
    const woman: StartAthlete = { ...man, sex: "female", bodyWeightKg: 62, experience: "beginner" };
    expect(start("barbell-back-squat", woman)).toBe(20);
    expect(start("barbell-bench-press", woman)).toBeNull();
    expect(start("dumbbell-bench-press", woman)).toBeGreaterThan(0);
  });

  it("rounds to the available weights, preferring the lighter step", () => {
    const dumbbells = createLadder({ unit: "kg", increment: 2.5, values: [5, 7.5, 10, 12.5, 15] });
    const item = exercise("dumbbell-bench-press");
    const raw = rawStartWeightKg(item, man, prescription);
    const result = startWeightKg(item, man, prescription, dumbbells);
    expect([5, 7.5, 10, 12.5, 15]).toContain(result);
    expect(result).toBeLessThanOrEqual(raw * 1.1);
  });

  it("gives assistance machines a generous assistance and skips other types", () => {
    const beginner = start("assisted-pull-up-machine", { ...man, experience: "beginner" });
    const advanced = start("assisted-pull-up-machine", { ...man, experience: "advanced" });
    expect(beginner).toBeGreaterThan(advanced ?? 0);
    expect(beginner).toBeGreaterThanOrEqual(80 * 0.45);
    expect(start("pull-up")).toBeNull();
    expect(start("push-up")).toBeNull();
    expect(start("barbell-bench-press", { ...man, bodyWeightKg: 0 })).toBeNull();
  });
});
