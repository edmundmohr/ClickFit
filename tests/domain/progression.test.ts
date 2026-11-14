import { describe, expect, it } from "vitest";
import {
  defaultIncrementKg,
  deloadSetCount,
  isDeloadWeek,
  nextSetTargets,
  warmupSets,
  type PerformedSet,
  type Prescription,
} from "@/domain/training/progression";

const prescription: Prescription = { sets: 3, repMin: 8, repMax: 12, targetRir: 2 };
const set = (weightKg: number | null, reps: number | null, rir: number | null = null): PerformedSet => ({
  weightKg,
  reps,
  rir,
});

function targets(previous: PerformedSet[], overrides: Partial<Parameters<typeof nextSetTargets>[0]> = {}) {
  return nextSetTargets({
    exerciseType: "weight_reps",
    prescription,
    previous,
    incrementKg: 2.5,
    isDeload: false,
    ...overrides,
  });
}

describe("per-set double progression", () => {
  it("returns empty targets without history", () => {
    expect(targets([])).toEqual([
      { weightKg: null, reps: null },
      { weightKg: null, reps: null },
      { weightKg: null, reps: null },
    ]);
  });

  it("adds one rep at the same weight while inside the rep range", () => {
    expect(targets([set(60, 9), set(60, 9), set(60, 8)])).toEqual([
      { weightKg: 60, reps: 10 },
      { weightKg: 60, reps: 10 },
      { weightKg: 60, reps: 9 },
    ]);
  });

  it("raises the weight and resets reps once the top of the range is reached", () => {
    expect(targets([set(60, 12), set(60, 12), set(60, 11)])).toEqual([
      { weightKg: 62.5, reps: 8 },
      { weightKg: 62.5, reps: 8 },
      { weightKg: 60, reps: 12 },
    ]);
  });

  it("decides for every set on its own", () => {
    const result = targets([set(60, 12), set(60, 10), set(60, 8)]);
    expect(result.map((target) => target.weightKg)).toEqual([62.5, 60, 60]);
  });

  it("progresses faster when the set was clearly too easy", () => {
    expect(targets([set(60, 9, 4)])[0]).toEqual({ weightKg: 60, reps: 11 });
  });

  it("repeats the target when the set was much harder than intended", () => {
    expect(targets([set(60, 9, 0)])[0]).toEqual({ weightKg: 60, reps: 9 });
  });

  it("reduces the weight when the reps fell far below the range", () => {
    expect(targets([set(60, 5)])[0]).toEqual({ weightKg: 57.5, reps: 8 });
  });

  it("keeps the weight when the reps were just below the range", () => {
    expect(targets([set(60, 7)])[0]).toEqual({ weightKg: 60, reps: 8 });
  });

  it("uses the last known set when fewer sets were logged than planned", () => {
    const result = targets([set(60, 10)]);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ weightKg: 60, reps: 11 });
  });

  it("ignores sets without reps", () => {
    expect(targets([set(60, null), set(60, 9)])[0]).toEqual({ weightKg: 60, reps: 10 });
  });

  it("never suggests a negative weight", () => {
    expect(targets([set(0, 4)])[0].weightKg).toBe(0);
  });
});

describe("other exercise types", () => {
  it("adds reps for bodyweight exercises, also beyond the range", () => {
    expect(targets([set(null, 12)], { exerciseType: "bodyweight_reps" })[0]).toEqual({
      weightKg: null,
      reps: 13,
    });
  });

  it("adds five seconds for timed exercises", () => {
    expect(targets([set(null, 40)], { exerciseType: "duration" })[0]).toEqual({
      weightKg: null,
      reps: 45,
    });
  });

  it("reduces the assistance when an assisted exercise gets easier", () => {
    expect(targets([set(30, 12)], { exerciseType: "assisted_bodyweight" })[0]).toEqual({
      weightKg: 27.5,
      reps: 8,
    });
  });

  it("adds load to weighted bodyweight exercises that started without extra weight", () => {
    expect(targets([set(null, 12)], { exerciseType: "weighted_bodyweight" })[0]).toEqual({
      weightKg: 2.5,
      reps: 8,
    });
  });
});

describe("deload", () => {
  it("is the last week of every block", () => {
    expect(isDeloadWeek(0, 6)).toBe(false);
    expect(isDeloadWeek(34, 6)).toBe(false);
    expect(isDeloadWeek(35, 6)).toBe(true);
    expect(isDeloadWeek(41, 6)).toBe(true);
    expect(isDeloadWeek(42, 6)).toBe(false);
    expect(isDeloadWeek(77, 6)).toBe(true);
  });

  it("is never active for invalid input", () => {
    expect(isDeloadWeek(-3, 6)).toBe(false);
    expect(isDeloadWeek(100, 1)).toBe(false);
  });

  it("reduces sets, weight and reps", () => {
    expect(deloadSetCount(3)).toBe(2);
    expect(deloadSetCount(4)).toBe(3);
    expect(deloadSetCount(1)).toBe(1);
    const result = targets([set(100, 12), set(100, 10), set(100, 9)], { isDeload: true });
    expect(result).toEqual([
      { weightKg: 90, reps: 10 },
      { weightKg: 90, reps: 8 },
    ]);
  });

  it("gives more assistance to assisted exercises instead of less", () => {
    // Regression: 30 kg Unterstützung wurden zu 27,5 kg – die Deload-Woche war dadurch schwerer.
    const [first] = targets([set(30, 10)], { exerciseType: "assisted_bodyweight", isDeload: true });
    expect(first).toEqual({ weightKg: 32.5, reps: 8 });
    const [heavy] = targets([set(60, 10)], { exerciseType: "assisted_bodyweight", isDeload: true });
    expect(heavy.weightKg).toBeCloseTo(67.5, 6);
    // Ohne Unterstützung gibt es mindestens eine Stufe Hilfe.
    expect(targets([set(0, 10)], { exerciseType: "assisted_bodyweight", isDeload: true })[0].weightKg).toBe(2.5);
  });

  it("shortens timed exercises noticeably instead of by two seconds", () => {
    const plank = { sets: 3, repMin: 30, repMax: 60, targetRir: 2 };
    const deload = (seconds: number) =>
      targets([set(null, seconds)], { exerciseType: "duration", prescription: plank, isDeload: true })[0];
    expect(deload(60)).toEqual({ weightKg: null, reps: 50 });
    expect(deload(90)).toEqual({ weightKg: null, reps: 70 });
    expect(deload(30)).toEqual({ weightKg: null, reps: 25 });
    expect(deload(5)).toEqual({ weightKg: null, reps: 5 });
  });

  it("keeps the two-rep deload for bodyweight exercises", () => {
    expect(targets([set(null, 12)], { exerciseType: "bodyweight_reps", isDeload: true })[0]).toEqual({
      weightKg: null,
      reps: 10,
    });
  });
});

describe("increments and warm-up", () => {
  it("picks the increment from the equipment", () => {
    expect(defaultIncrementKg({ equipment: ["barbell", "rack"] })).toBe(2.5);
    expect(defaultIncrementKg({ equipment: ["bench", "dumbbell"] })).toBe(2);
    expect(defaultIncrementKg({ equipment: ["machine"] })).toBe(5);
    expect(defaultIncrementKg({ equipment: [] })).toBe(2.5);
  });

  it("builds rising warm-up sets below the working weight", () => {
    expect(warmupSets(100, 2.5, 20)).toEqual([
      { weightKg: 40, reps: 8 },
      { weightKg: 60, reps: 5 },
      { weightKg: 80, reps: 3 },
    ]);
  });

  it("drops duplicate or pointless warm-up steps for light weights", () => {
    expect(warmupSets(30, 2.5, 20)).toEqual([
      { weightKg: 20, reps: 8 },
      { weightKg: 25, reps: 3 },
    ]);
    expect(warmupSets(20, 2.5, 20)).toEqual([]);
  });

  it("never goes below the empty bar and stays on its steps", () => {
    expect(warmupSets(40, 2.5, 20)).toEqual([
      { weightKg: 20, reps: 8 },
      { weightKg: 25, reps: 5 },
      { weightKg: 32.5, reps: 3 },
    ]);
    // 7-kg-SZ-Stange: Stufen 7 + n × 2,5 statt Vielfacher von 2,5.
    expect(warmupSets(30, 2.5, 7)).toEqual([
      { weightKg: 12, reps: 8 },
      { weightKg: 17, reps: 5 },
      { weightKg: 24.5, reps: 3 },
    ]);
    for (const warmup of warmupSets(60, 2.5, 20)) expect(warmup.weightKg).toBeGreaterThanOrEqual(20);
  });
});
