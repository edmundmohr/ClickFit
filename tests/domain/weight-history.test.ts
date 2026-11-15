import { describe, expect, it } from "vitest";
import { weightTrend } from "@/domain/nutrition/adaptive";
import {
  DEFAULT_WEIGHT_RANGE,
  needsYearLabels,
  parseWeightRange,
  pointsInRange,
  trendChangeInRange,
  weightRangeStart,
} from "@/domain/progress/weight-history";
import { addDays } from "@/lib/dates";

const TODAY = "2026-11-16";

describe("weight history", () => {
  it("reads the range from the search parameter", () => {
    expect(parseWeightRange("30")).toBe("30");
    expect(parseWeightRange("all")).toBe("all");
    expect(parseWeightRange("7")).toBe(DEFAULT_WEIGHT_RANGE);
    expect(parseWeightRange(undefined)).toBe(DEFAULT_WEIGHT_RANGE);
    expect(parseWeightRange(["30"])).toBe(DEFAULT_WEIGHT_RANGE);
  });

  it("starts the range so that it covers exactly the given number of days", () => {
    expect(weightRangeStart("30", TODAY)).toBe(addDays(TODAY, -29));
    expect(weightRangeStart("365", TODAY)).toBe("2025-11-17");
    expect(weightRangeStart("all", TODAY)).toBeNull();
  });

  it("keeps the trend from earlier measurements when cutting the range", () => {
    const trend = weightTrend([
      { date: addDays(TODAY, -60), weightKg: 90 },
      { date: addDays(TODAY, -10), weightKg: 80 },
      { date: TODAY, weightKg: 80 },
    ]);
    const visible = pointsInRange(trend, weightRangeStart("30", TODAY));
    expect(visible.map((point) => point.date)).toEqual([addDays(TODAY, -10), TODAY]);
    // Der erste sichtbare Punkt trägt den geglätteten Wert, nicht den Rohwert.
    expect(visible[0].trendKg).toBeGreaterThan(80);
    expect(trendChangeInRange(visible)).toBeLessThan(0);
    expect(pointsInRange(trend, null)).toHaveLength(3);
  });

  it("needs two points for a change", () => {
    expect(trendChangeInRange([])).toBeNull();
    expect(trendChangeInRange(weightTrend([{ date: TODAY, weightKg: 80 }]))).toBeNull();
  });

  it("shows the year on long ranges or across a new year", () => {
    expect(needsYearLabels("180", [])).toBe(false);
    expect(needsYearLabels("365", [])).toBe(true);
    expect(needsYearLabels("all", [{ date: "2026-01-02" }, { date: TODAY }])).toBe(false);
    expect(needsYearLabels("all", [{ date: "2025-12-30" }, { date: TODAY }])).toBe(true);
  });
});
