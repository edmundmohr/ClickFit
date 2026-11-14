import { describe, expect, it } from "vitest";
import {
  bestsOf,
  detectRecords,
  estimateOneRepMax,
  sessionTotals,
  type ExerciseBests,
  type LoggedSet,
} from "@/domain/training/records";

const work = (weightKg: number | null, reps: number | null, completed = true): LoggedSet => ({
  type: "work",
  weightKg,
  reps,
  completed,
});

describe("estimated one-rep max", () => {
  it("uses the Epley formula", () => {
    expect(estimateOneRepMax(100, 1)).toBe(100);
    expect(estimateOneRepMax(100, 10)).toBeCloseTo(133.33, 2);
    expect(estimateOneRepMax(0, 10)).toBe(0);
    expect(estimateOneRepMax(100, 0)).toBe(0);
  });
});

describe("session totals", () => {
  it("ignores warm-up and unfinished sets", () => {
    const totals = sessionTotals([
      { type: "warmup", weightKg: 40, reps: 8, completed: true },
      work(80, 10),
      work(80, 8),
      work(80, 8, false),
      { type: "drop", weightKg: 60, reps: 10, completed: true },
    ]);
    expect(totals).toEqual({ completedSets: 3, volumeKg: 80 * 10 + 80 * 8 + 60 * 10 });
  });
});

describe("personal records", () => {
  const previous: ExerciseBests = {
    maxWeightKg: 80,
    maxOneRepMaxKg: 100,
    maxReps: 12,
    maxSetVolumeKg: 800,
  };

  it("reports nothing on the very first session", () => {
    expect(detectRecords([work(100, 10)], null)).toEqual([]);
  });

  it("detects a heavier weight, a better 1RM and more set volume", () => {
    const records = detectRecords([work(85, 10)], previous);
    expect(records.map((record) => record.type).sort()).toEqual(["one_rep_max", "set_volume", "weight"]);
    expect(records.find((record) => record.type === "weight")?.value).toBe(85);
  });

  it("does not report equal values as records", () => {
    const same = [work(80, 10)];
    expect(detectRecords(same, bestsOf(same))).toEqual([]);
  });

  it("does not count warm-up sets", () => {
    expect(detectRecords([{ type: "warmup", weightKg: 120, reps: 5, completed: true }], previous)).toEqual([]);
  });

  it("ignores very high rep sets for the 1RM estimate", () => {
    const bests = bestsOf([work(50, 30)]);
    expect(bests.maxOneRepMaxKg).toBeNull();
    expect(bests.maxSetVolumeKg).toBe(1500);
  });

  it("tracks rep records only for exercises without weight", () => {
    const bodyweight: ExerciseBests = {
      maxWeightKg: null,
      maxOneRepMaxKg: null,
      maxReps: 12,
      maxSetVolumeKg: null,
    };
    expect(detectRecords([work(null, 15)], bodyweight)).toEqual([{ type: "reps", value: 15 }]);
    expect(detectRecords([work(40, 20)], previous).map((record) => record.type)).not.toContain("reps");
  });
});
