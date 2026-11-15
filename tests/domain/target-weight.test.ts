import { describe, expect, it } from "vitest";
import { nextSetTargets } from "@/domain/training/progression";
import {
  keptTargetWeight,
  plannedWeightApplies,
  sameWeight,
  targetWeightChanges,
  targetWeightSetAt,
} from "@/domain/training/target-weight";

const EARLIER = new Date("2026-11-10T17:00:00Z");
const NOW = new Date("2026-11-16T17:00:00Z");
const LATER = new Date("2026-11-18T17:00:00Z");
const prescription = { sets: 3, repMin: 8, repMax: 12, targetRir: 2 };
const lastTime = [
  { weightKg: 60, reps: 12, rir: 2 },
  { weightKg: 60, reps: 12, rir: 2 },
  { weightKg: 60, reps: 12, rir: 2 },
];

describe("target weight changes", () => {
  const before = [
    { exerciseId: "bench", targetWeightKg: 60, targetWeightSetAt: EARLIER },
    { exerciseId: "row", targetWeightKg: null, targetWeightSetAt: null },
    { exerciseId: "bench", targetWeightKg: 40, targetWeightSetAt: EARLIER },
  ];

  it("records new, changed and cleared weights, but not unchanged or removed ones", () => {
    expect(
      targetWeightChanges(before, [
        { exerciseId: "bench", targetWeightKg: 62.5 },
        { exerciseId: "row", targetWeightKg: 50 },
        { exerciseId: "curl", targetWeightKg: 12 },
        { exerciseId: "press", targetWeightKg: null },
      ]),
    ).toEqual([
      { exerciseId: "bench", fromKg: 60, toKg: 62.5 },
      { exerciseId: "row", fromKg: null, toKg: 50 },
      { exerciseId: "curl", fromKg: null, toKg: 12 },
    ]);
    expect(targetWeightChanges(before, [{ exerciseId: "bench", targetWeightKg: 60.004 }])).toEqual([]);
    expect(targetWeightChanges(before, [{ exerciseId: "bench", targetWeightKg: null }])).toEqual([
      { exerciseId: "bench", fromKg: 60, toKg: null },
    ]);
  });

  it("keeps the time of an unchanged weight and stamps a new one", () => {
    expect(targetWeightSetAt(before, "bench", 60, NOW)).toEqual(EARLIER);
    expect(targetWeightSetAt(before, "bench", 65, NOW)).toEqual(NOW);
    expect(targetWeightSetAt(before, "row", 50, NOW)).toEqual(NOW);
    expect(targetWeightSetAt(before, "bench", null, NOW)).toBeNull();
    expect(keptTargetWeight(before, "bench")).toBe(60);
    expect(keptTargetWeight(before, "curl")).toBeNull();
    expect(sameWeight(null, null)).toBe(true);
    expect(sameWeight(null, 0)).toBe(false);
  });

  it("applies until the exercise was trained after the change", () => {
    expect(plannedWeightApplies(null, NOW, null)).toBe(false);
    expect(plannedWeightApplies(50, NOW, null)).toBe(true);
    expect(plannedWeightApplies(50, NOW, EARLIER)).toBe(true);
    expect(plannedWeightApplies(50, NOW, LATER)).toBe(false);
    expect(plannedWeightApplies(50, null, EARLIER)).toBe(false);
  });
});

describe("progression with a planned weight", () => {
  const base = { exerciseType: "weight_reps" as const, prescription, previous: lastTime, incrementKg: 2.5, isDeload: false };

  it("starts every set at the planned weight with the lower rep target", () => {
    // Ohne Vorgabe ginge es nach 12 Wiederholungen auf 62,5 kg.
    expect(nextSetTargets(base)[0]).toEqual({ weightKg: 62.5, reps: 8 });
    expect(nextSetTargets({ ...base, plannedWeightKg: 50 })).toEqual([
      { weightKg: 50, reps: 8 },
      { weightKg: 50, reps: 8 },
      { weightKg: 50, reps: 8 },
    ]);
    // Genau wie eingetragen, auch abseits der Gewichtsstufen und ohne Vorgeschichte.
    expect(nextSetTargets({ ...base, previous: [], plannedWeightKg: 51 })[0]).toEqual({ weightKg: 51, reps: 8 });
  });

  it("is ignored by the re-entry factor and the cycle, but lighter in a deload week", () => {
    expect(nextSetTargets({ ...base, plannedWeightKg: 50, weightFactor: 0.8, hold: true })[0]).toEqual({ weightKg: 50, reps: 8 });
    const deload = nextSetTargets({ ...base, plannedWeightKg: 50, isDeload: true });
    expect(deload).toHaveLength(2);
    expect(deload[0]).toEqual({ weightKg: 45, reps: 8 });
  });

  it("has no effect on exercises without external weight", () => {
    const bodyweight = { ...base, exerciseType: "bodyweight_reps" as const, previous: [{ weightKg: null, reps: 10, rir: 2 }] };
    expect(nextSetTargets({ ...bodyweight, plannedWeightKg: 20 })[0]).toEqual({ weightKg: null, reps: 11 });
  });
});
