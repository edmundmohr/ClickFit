import { describe, expect, it } from "vitest";
import { nextSetTargets } from "@/domain/training/progression";
import { createLadder, fromKg, ladderFor, parseWeightList, type BarSetup, type WeightContext } from "@/domain/training/weights";

const KG_BAR: BarSetup = {
  unit: "kg",
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25].map((weight) => ({ weight, pairs: 2 })),
};
const barContext = (bar: BarSetup): WeightContext => ({ defaultUnit: "kg", rules: [], bar });

describe("fixed weight lists", () => {
  const dumbbells = createLadder({ unit: "kg", increment: 2, values: [4, 6, 8, 10, 12.5, 15, 20] });

  it("keeps a weight above the heaviest step instead of lowering it", () => {
    // Regression: 22,5 kg wurden bei „schwerer“ auf 20 kg gesenkt.
    expect(dumbbells.up(22.5)).toBe(22.5);
    expect(dumbbells.up(20)).toBe(20);
    expect(dumbbells.up(17)).toBe(20);
  });

  it("keeps a weight below the lightest step instead of raising it", () => {
    expect(dumbbells.down(3)).toBe(3);
    expect(dumbbells.down(4)).toBe(4);
    expect(dumbbells.down(5)).toBe(4);
  });

  it("reports the lightest available weight as minimum", () => {
    expect(dumbbells.minWeightKg).toBe(4);
    expect(createLadder({ unit: "kg", increment: 2.5 }).minWeightKg).toBe(0);
  });
});

describe("barbell ladders start at the empty bar", () => {
  const barbell = ladderFor(["barbell", "rack"], barContext(KG_BAR));

  it("exposes the bar weight as minimum", () => {
    expect(barbell.minWeightKg).toBe(20);
    expect(barbell.incrementKg).toBe(2.5);
  });

  it("never steps below the empty bar", () => {
    expect(barbell.down(20)).toBe(20);
    expect(barbell.down(22.5)).toBe(20);
    expect(barbell.nearest(17)).toBe(20);
    expect(barbell.nearest(5)).toBe(20);
    expect(barbell.up(20)).toBe(22.5);
    // Unter der Stange (z. B. alte Werte) geht es nach oben auf die Stange, nach unten bleibt es.
    expect(barbell.up(10)).toBe(20);
    expect(barbell.down(10)).toBe(10);
  });

  it("aligns the steps with a 7 kg EZ bar", () => {
    const ez = ladderFor(["ez_bar"], barContext({ ...KG_BAR, barWeight: 7 }));
    // Regression: up(7) ergab 7,5 kg statt 9,5 kg.
    expect(ez.up(7)).toBe(9.5);
    expect(ez.up(9.5)).toBe(12);
    expect(ez.down(9.5)).toBe(7);
    expect(ez.nearest(10)).toBe(9.5);
    expect(ez.minWeightKg).toBe(7);
  });

  it("starts at the bar also with an own step rule for the barbell", () => {
    const ladder = ladderFor(["barbell"], {
      defaultUnit: "kg",
      rules: [{ equipment: "barbell", unit: "kg", increment: 2, values: [] }],
      bar: KG_BAR,
    });
    expect(ladder.minWeightKg).toBe(20);
    expect(ladder.up(20)).toBe(22);
    expect(ladder.down(20)).toBe(20);
  });

  it("works with a bar in pounds", () => {
    const lbs = ladderFor(["barbell"], barContext({ unit: "lbs", barWeight: 45, plates: [{ weight: 2.5, pairs: 2 }] }));
    expect(fromKg(lbs.minWeightKg, "lbs")).toBeCloseTo(45, 2);
    expect(fromKg(lbs.up(lbs.minWeightKg), "lbs")).toBeCloseTo(50, 2);
    expect(fromKg(lbs.down(lbs.minWeightKg), "lbs")).toBeCloseTo(45, 2);
  });

  it("keeps the empty bar when the reps fell far below the range", () => {
    // Regression: 20 kg × 5 bei Zielbereich 8–12 ergab 17,5 kg – leichter als die Stange.
    const [target] = nextSetTargets({
      exerciseType: "weight_reps",
      prescription: { sets: 1, repMin: 8, repMax: 12, targetRir: 2 },
      previous: [{ weightKg: 20, reps: 5, rir: null }],
      incrementKg: barbell.incrementKg,
      steps: barbell,
      isDeload: false,
    });
    expect(target).toEqual({ weightKg: 20, reps: 8 });
  });

  it("keeps the empty bar in a deload week", () => {
    const [target] = nextSetTargets({
      exerciseType: "weight_reps",
      prescription: { sets: 1, repMin: 8, repMax: 12, targetRir: 2 },
      previous: [{ weightKg: 20, reps: 10, rir: null }],
      incrementKg: barbell.incrementKg,
      steps: barbell,
      isDeload: true,
    });
    expect(target.weightKg).toBe(20);
  });
});

describe("parsing a list of weights", () => {
  it("separates by spaces, semicolons and commas followed by a space", () => {
    expect(parseWeightList("2, 4, 6,5 8")).toEqual([2, 4, 6.5, 8]);
    expect(parseWeightList("2;4;6")).toEqual([2, 4, 6]);
  });

  it("treats several commas without spaces as separators", () => {
    // Regression: „2,4,6,8“ ergab eine leere Liste.
    expect(parseWeightList("2,4,6,8")).toEqual([2, 4, 6, 8]);
    expect(parseWeightList("2,4,6,8,")).toEqual([2, 4, 6, 8]);
  });

  it("treats commas as separators when a decimal point is used", () => {
    expect(parseWeightList("2.5,5,7.5")).toEqual([2.5, 5, 7.5]);
  });

  it("reads a single comma as decimal comma", () => {
    expect(parseWeightList("6,5")).toEqual([6.5]);
    expect(parseWeightList("2,5 4,5")).toEqual([2.5, 4.5]);
  });

  it("drops only the invalid parts", () => {
    expect(parseWeightList("4,abc,8")).toEqual([4, 8]);
    expect(parseWeightList("abc")).toEqual([]);
    expect(parseWeightList("  ")).toEqual([]);
  });
});
