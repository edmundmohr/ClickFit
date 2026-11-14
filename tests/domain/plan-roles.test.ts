import { describe, expect, it } from "vitest";
import { dayStatus } from "@/domain/training/calendar";
import {
  nextScheduledDay,
  planStatusChange,
  resolvePlanGym,
  scheduledWeekdays,
  todayOverview,
  type ScheduledPlan,
} from "@/domain/training/plan-roles";
import type { Weekday } from "@/domain/training/types";

type Day = { id: string; weekday: Weekday | null };

const plan = (id: string, status: ScheduledPlan<Day>["status"], days: Day[]): ScheduledPlan<Day> => ({
  id,
  status,
  days,
});

// Hauptplan „Haus“ Mo/Mi/Fr, Zusatzplan „Draußen“ Mi/Sa, inaktiver „Winter“ täglich.
const house = plan("house", "active", [
  { id: "h1", weekday: 1 },
  { id: "h3", weekday: 3 },
  { id: "h5", weekday: 5 },
  { id: "hx", weekday: null },
]);
const outdoor = plan("outdoor", "extra", [
  { id: "o3", weekday: 3 },
  { id: "o6", weekday: 6 },
]);
const winter = plan("winter", "saved", [{ id: "w2", weekday: 2 }]);
const archived = plan("old", "archived", [{ id: "a4", weekday: 4 }]);
const plans = [winter, outdoor, house, archived];

describe("planStatusChange", () => {
  it("makes a saved plan the main plan, demotes the old one and restarts the new one", () => {
    expect(planStatusChange("saved", "active")).toEqual({ ok: true, demoteMain: true, restart: true });
  });

  it("keeps the start date when an extra plan becomes the main plan", () => {
    expect(planStatusChange("extra", "active")).toEqual({ ok: true, demoteMain: true, restart: false });
  });

  it("restarts a plan that becomes an extra plan from the archive", () => {
    expect(planStatusChange("archived", "extra")).toEqual({ ok: true, demoteMain: false, restart: true });
  });

  it("does not restart an extra plan that is set inactive or archived", () => {
    expect(planStatusChange("extra", "saved")).toEqual({ ok: true, demoteMain: false, restart: false });
    expect(planStatusChange("saved", "archived")).toEqual({ ok: true, demoteMain: false, restart: false });
  });

  it("refuses to give up the main plan without choosing another one", () => {
    expect(planStatusChange("active", "extra")).toEqual({ ok: false, error: "PLAN_ACTIVE" });
    expect(planStatusChange("active", "archived")).toEqual({ ok: false, error: "PLAN_ACTIVE" });
  });

  it("treats an unchanged status as a no-op", () => {
    expect(planStatusChange("active", "active")).toEqual({ ok: true, demoteMain: false, restart: false });
  });
});

describe("scheduledWeekdays", () => {
  it("merges main and extra plans and ignores inactive, archived and unscheduled routines", () => {
    expect(scheduledWeekdays(plans)).toEqual([1, 3, 5, 6]);
  });
});

describe("todayOverview", () => {
  it("lists the main plan's units before the extra plan's", () => {
    const overview = todayOverview(plans, 3, []);
    expect(overview.units.map((unit) => [unit.planId, unit.day.id, unit.done])).toEqual([
      ["house", "h3", null],
      ["outdoor", "o3", null],
    ]);
    expect(overview.unplanned).toEqual([]);
  });

  it("ticks off the morning unit and keeps the evening unit open", () => {
    const morning = { id: "s1", planDayId: "o3" };
    const overview = todayOverview(plans, 3, [morning]);
    expect(overview.units.find((unit) => unit.day.id === "o3")?.done).toBe(morning);
    expect(overview.units.find((unit) => unit.day.id === "h3")?.done).toBeNull();
  });

  it("collects spontaneous sessions separately", () => {
    const spontaneous = { id: "s2", planDayId: "w2" };
    const free = { id: "s3", planDayId: null };
    const overview = todayOverview(plans, 3, [spontaneous, free]);
    expect(overview.unplanned).toEqual([spontaneous, free]);
  });

  it("uses one session for one planned unit only", () => {
    const twice = [
      { id: "s1", planDayId: "h3" },
      { id: "s2", planDayId: "h3" },
    ];
    const overview = todayOverview(plans, 3, twice);
    expect(overview.units[0]?.done).toBe(twice[0]);
    expect(overview.unplanned).toEqual([twice[1]]);
  });

  it("has no units on a day that only an inactive plan schedules", () => {
    expect(todayOverview(plans, 2, []).units).toEqual([]);
  });
});

describe("nextScheduledDay", () => {
  it("finds the next scheduled routine across main and extra plans", () => {
    expect(nextScheduledDay(plans, 5)?.id).toBe("o6");
    expect(nextScheduledDay(plans, 6)?.id).toBe("h1");
  });

  it("prefers the main plan on a shared day", () => {
    expect(nextScheduledDay(plans, 1)?.id).toBe("h3");
  });

  it("returns null without scheduled weekdays", () => {
    expect(nextScheduledDay([winter], 1)).toBeNull();
  });
});

describe("resolvePlanGym", () => {
  const studio = { id: "studio" };
  const park = { id: "park" };
  const gyms = [studio, park];

  it("uses the plan's fixed location", () => {
    expect(resolvePlanGym("park", gyms, studio)).toBe(park);
  });

  it("falls back to today's location without a fixed or with a deleted location", () => {
    expect(resolvePlanGym(null, gyms, studio)).toBe(studio);
    expect(resolvePlanGym("gone", gyms, studio)).toBe(studio);
  });
});

describe("dayStatus with several plans", () => {
  // 2026-11-16 ist ein Montag.
  const schedules = [
    { startDate: "2026-11-01", weekdays: [1] as Weekday[] },
    { startDate: "2026-11-18", weekdays: [6] as Weekday[] },
  ];

  it("plans a day as soon as one plan schedules it from its start", () => {
    expect(dayStatus("2026-11-16", new Set(), schedules, "2026-11-20")).toBe("missed");
    expect(dayStatus("2026-11-21", new Set(), schedules, "2026-11-20")).toBe("planned");
  });

  it("ignores days before a plan's start", () => {
    expect(dayStatus("2026-11-14", new Set(), schedules, "2026-11-20")).toBe("rest");
  });
});
