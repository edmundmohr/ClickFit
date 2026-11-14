import { describe, expect, it } from "vitest";
import {
  estimateRemainingSeconds,
  isWorkoutForgotten,
  suggestFinishTime,
  trainingStreak,
} from "@/domain/training/schedule";
import type { Weekday } from "@/domain/training/types";
import {
  addDays,
  buildCalendarMonth,
  diffDays,
  isValidLocalDate,
  shiftMonth,
  startOfWeek,
  toLocalDate,
  weekdayOf,
} from "@/lib/dates";
import { fromDisplayWeight, parseDecimal, toDisplayWeight } from "@/lib/units";

// 2026-11-16 ist ein Montag.
const MON = "2026-11-16";
const monWedFri: Weekday[] = [1, 3, 5];

describe("training streak", () => {
  it("counts completed training days and ignores rest days", () => {
    const done = new Set(["2026-11-09", "2026-11-11", "2026-11-13", MON]);
    expect(trainingStreak(done, monWedFri, MON)).toBe(4);
  });

  it("does not break on a planned day that is still today", () => {
    const done = new Set(["2026-11-11", "2026-11-13"]);
    expect(trainingStreak(done, monWedFri, MON)).toBe(2);
  });

  it("breaks at a missed planned day", () => {
    const done = new Set(["2026-11-09", "2026-11-13", MON]);
    expect(trainingStreak(done, monWedFri, MON)).toBe(2);
  });

  it("counts extra workouts on rest days", () => {
    const done = new Set(["2026-11-13", "2026-11-14", MON]);
    expect(trainingStreak(done, monWedFri, MON)).toBe(3);
  });

  it("requires consecutive days when nothing is planned", () => {
    const done = new Set(["2026-11-13", "2026-11-15", MON]);
    expect(trainingStreak(done, [], MON)).toBe(2);
  });

  it("is zero without workouts", () => {
    expect(trainingStreak(new Set(), monWedFri, MON)).toBe(0);
  });
});

describe("time estimates and forgotten workouts", () => {
  const exercise = (restSeconds: number, sets: { completed: boolean; type?: "warmup" | "work" | "drop" }[], groupId: string | null = null) => ({
    groupId,
    restSeconds,
    sets,
  });
  const open = (count: number) => Array.from({ length: count }, () => ({ completed: false }));

  it("counts rest only between open sets, not after the last one", () => {
    // Regression: 3 offene Sätze à 150 s Pause ergaben 570 s statt 420 s.
    expect(estimateRemainingSeconds([exercise(150, open(3))])).toBe(3 * 40 + 2 * 150);
    expect(estimateRemainingSeconds([exercise(150, [{ completed: true }, ...open(2)])])).toBe(2 * 40 + 150);
    expect(estimateRemainingSeconds([exercise(150, [{ completed: true }])])).toBe(0);
    expect(estimateRemainingSeconds([])).toBe(0);
  });

  it("rests once per round in a superset", () => {
    // Supersatz A/B mit je 3 Sätzen und 90 s Pause: 6 × 40 s Arbeit + 2 × 90 s Pause = 7 min.
    const seconds = estimateRemainingSeconds([exercise(90, open(3), "g"), exercise(60, open(3), "g")]);
    expect(seconds).toBe(7 * 60);
  });

  it("adds no full rest after warm-up and drop sets", () => {
    const sets = [
      { completed: false, type: "warmup" as const },
      { completed: false, type: "warmup" as const },
      { completed: false, type: "work" as const },
      { completed: false, type: "drop" as const },
      { completed: false, type: "work" as const },
    ];
    expect(estimateRemainingSeconds([exercise(120, sets)])).toBe(5 * 40 + 120);
  });

  it("adds the change-over time between open exercises like the plan estimate", () => {
    const seconds = estimateRemainingSeconds([exercise(150, [{ completed: true }]), exercise(150, open(2)), exercise(60, open(2))]);
    expect(seconds).toBe(2 * 40 + 150 + 60 + 2 * 40 + 60);
  });

  it("flags workouts running longer than three hours", () => {
    const start = new Date("2026-11-16T10:00:00Z");
    expect(isWorkoutForgotten(start, new Date("2026-11-16T12:59:00Z"))).toBe(false);
    expect(isWorkoutForgotten(start, new Date("2026-11-16T13:01:00Z"))).toBe(true);
  });

  it("suggests an end shortly after the last logged set", () => {
    const start = new Date("2026-11-16T10:00:00Z");
    expect(suggestFinishTime(start, new Date("2026-11-16T10:50:00Z")).toISOString()).toBe(
      "2026-11-16T10:52:00.000Z",
    );
    expect(suggestFinishTime(start, null).toISOString()).toBe("2026-11-16T11:00:00.000Z");
  });
});

describe("date helpers", () => {
  it("uses the app time zone for the local date", () => {
    expect(toLocalDate(new Date("2026-11-15T23:30:00Z"), "Europe/Berlin")).toBe("2026-11-16");
    expect(toLocalDate(new Date("2026-06-30T21:59:00Z"), "Europe/Berlin")).toBe("2026-06-30");
    expect(toLocalDate(new Date("2026-06-30T22:01:00Z"), "Europe/Berlin")).toBe("2026-07-01");
  });

  it("calculates with days across month and DST boundaries", () => {
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(diffDays("2026-03-27", "2026-03-30")).toBe(3);
    expect(weekdayOf(MON)).toBe(1);
    expect(weekdayOf("2026-11-22")).toBe(7);
    expect(startOfWeek("2026-11-19")).toBe(MON);
  });

  it("validates local dates", () => {
    expect(isValidLocalDate("2026-02-28")).toBe(true);
    expect(isValidLocalDate("2026-02-30")).toBe(false);
    expect(isValidLocalDate("16.11.2026")).toBe(false);
  });

  it("builds a Monday-based month grid", () => {
    const november = buildCalendarMonth(2026, 11);
    expect(november.weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(november.weeks.at(-1)?.[0]).toBe("2026-11-30");
    expect(november.weeks.every((week) => week.length === 7)).toBe(true);
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("weight units", () => {
  it("converts between kg and lbs", () => {
    expect(toDisplayWeight(100, "metric")).toBe(100);
    expect(toDisplayWeight(100, "imperial")).toBe(220.5);
    expect(fromDisplayWeight(220.5, "imperial")).toBeCloseTo(100.017, 3);
  });

  it("parses decimal input with comma or dot", () => {
    expect(parseDecimal("62,5")).toBe(62.5);
    expect(parseDecimal(" 62.5 ")).toBe(62.5);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("-5")).toBeNull();
  });
});
