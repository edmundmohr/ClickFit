import { describe, expect, it } from "vitest";
import {
  INTENSITY_FACTOR,
  MAX_EFFECTIVE_SETS,
  MUSCLE_SHARES,
  activityLoads,
  paceSecondsPerKm,
  speedKmh,
  usesPace,
} from "@/domain/cardio/load";
import { DEFAULT_INTERVAL, cardioWeekdays, generateCardioPlan, planTypes, type CardioPlanInput } from "@/domain/cardio/plan";
import { ACTIVITY_TYPES, intervalSeconds, type Activity } from "@/domain/cardio/types";
import { ageFromBirthYear, heartRateZones, maxHeartRate, zoneForHeartRate } from "@/domain/cardio/zones";
import { MUSCLES, type Muscle } from "@/domain/exercises/types";
import { recoveryStatus } from "@/domain/progress/recovery";

const ENDED_AT = new Date("2026-11-16T17:00:00Z");

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    date: "2026-11-16",
    type: "running",
    durationSeconds: 3600,
    distanceMeters: null,
    avgHeartRate: null,
    zone: null,
    intensity: "moderate",
    intervals: null,
    note: null,
    endedAt: ENDED_AT,
    ...overrides,
  };
}

function setsFor(item: Activity, muscle: Muscle): number {
  return activityLoads(item).find((load) => load.muscle === muscle)?.effectiveSets ?? 0;
}

describe("heart rate zones", () => {
  it("calculates the maximum heart rate after Tanaka", () => {
    expect(maxHeartRate(30)).toBe(187);
    expect(maxHeartRate(40)).toBe(180);
    expect(maxHeartRate(55)).toBe(170); // 169,5 wird aufgerundet
    expect(ageFromBirthYear(1996, 2026)).toBe(30);
  });

  it("builds five gapless zones from 50 to 100 percent", () => {
    const zones = heartRateZones(180);
    expect(zones.map((zone) => [zone.zone, zone.minBpm, zone.maxBpm])).toEqual([
      [1, 90, 107],
      [2, 108, 125],
      [3, 126, 143],
      [4, 144, 161],
      [5, 162, 180],
    ]);
    expect(zones.map((zone) => [zone.minPercent, zone.maxPercent])).toEqual([
      [50, 60],
      [60, 70],
      [70, 80],
      [80, 90],
      [90, 100],
    ]);
    for (let index = 1; index < zones.length; index++) expect(zones[index].minBpm).toBe(zones[index - 1].maxBpm + 1);
  });

  it("finds the zone for a heart rate", () => {
    expect(zoneForHeartRate(89, 180)).toBeNull();
    expect(zoneForHeartRate(90, 180)).toBe(1);
    expect(zoneForHeartRate(125, 180)).toBe(2);
    expect(zoneForHeartRate(126, 180)).toBe(3);
    expect(zoneForHeartRate(150, 180)).toBe(4);
    expect(zoneForHeartRate(180, 180)).toBe(5);
    expect(zoneForHeartRate(195, 180)).toBe(5);
  });
});

describe("cardio plan", () => {
  const base: CardioPlanInput = { types: ["running", "cycling"], sessionsPerWeek: 2, trainingWeekdays: [1, 3, 5], goal: "muscle_gain" };

  it("is deterministic", () => {
    const input: CardioPlanInput = { ...base, sessionsPerWeek: 4 };
    expect(generateCardioPlan(input)).toEqual(generateCardioPlan({ ...input, types: [...input.types] }));
  });

  it("puts sessions on days without strength training first, spread evenly", () => {
    expect(cardioWeekdays(2, [1, 3, 5])).toEqual([2, 6]);
    expect(cardioWeekdays(3, [1, 3, 5])).toEqual([2, 4, 6]);
    expect(cardioWeekdays(1, [1, 2, 3, 4, 5, 6])).toEqual([7]);
    expect(cardioWeekdays(3, [])).toEqual([1, 3, 5]);
  });

  it("uses training days only when the free days are used up", () => {
    const days = cardioWeekdays(4, [1, 2, 3, 4, 5]);
    expect(days).toEqual([2, 4, 6, 7]);
    expect(cardioWeekdays(7, [1, 3, 5])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(cardioWeekdays(12, [1])).toHaveLength(7);
    expect(cardioWeekdays(0, [1])).toEqual([]);
    expect(cardioWeekdays(-2, [1])).toEqual([]);
  });

  it("plans base sessions in zone 2 with 30 to 45 minutes, longer for fat loss", () => {
    const gain = generateCardioPlan(base);
    const loss = generateCardioPlan({ ...base, goal: "fat_loss" });
    expect(gain).toHaveLength(2);
    for (const session of [...gain, ...loss]) {
      expect(session.zone).toBe(2);
      expect(session.intervals).toBeNull();
      expect(session.minutes).toBeGreaterThanOrEqual(30);
      expect(session.minutes).toBeLessThanOrEqual(45);
    }
    expect(loss[0].minutes).toBeGreaterThan(gain[0].minutes);
  });

  it("rotates through the chosen types", () => {
    const plan = generateCardioPlan({ ...base, sessionsPerWeek: 4, types: ["running", "cycling", "rowing"] });
    expect(plan.map((session) => session.type)).toEqual(["running", "cycling", "rowing", "running"]);
  });

  it("falls back to walking and treats `other` as cross trainer", () => {
    expect(planTypes([])).toEqual(["walking"]);
    expect(planTypes(["other", "running", "running", "unknown"])).toEqual(["cross_trainer", "running"]);
    expect(generateCardioPlan({ ...base, types: [] }).every((session) => session.type === "walking")).toBe(true);
  });

  it("adds exactly one interval session from three sessions per week", () => {
    expect(generateCardioPlan({ ...base, sessionsPerWeek: 2 }).filter((session) => session.intervals)).toHaveLength(0);
    for (const sessionsPerWeek of [3, 4, 5, 7]) {
      const hard = generateCardioPlan({ ...base, sessionsPerWeek }).filter((session) => session.intervals);
      expect(hard).toHaveLength(1);
      expect(hard[0].zone).toBe(4);
      expect(hard[0].intervals).toEqual(DEFAULT_INTERVAL);
      // Die Intervalle passen mit Ein- und Auslaufen in die geplante Zeit.
      expect(hard[0].minutes * 60).toBeGreaterThan(intervalSeconds(DEFAULT_INTERVAL));
      expect([1, 3, 5]).not.toContain(hard[0].weekday);
    }
  });

  it("keeps walking intervals moderate", () => {
    const hard = generateCardioPlan({ ...base, types: ["walking"], sessionsPerWeek: 3 }).filter((session) => session.intervals);
    expect(hard).toHaveLength(1);
    expect(hard[0].zone).toBe(3);
  });

  it("plans at most one session per day on valid weekdays", () => {
    const plan = generateCardioPlan({ ...base, sessionsPerWeek: 6 });
    const days = plan.map((session) => session.weekday);
    expect(new Set(days).size).toBe(6);
    expect(days).toEqual([...days].sort((a, b) => a - b));
  });
});

describe("activity load", () => {
  it("counts 60 moderate minutes as about five sets on the main muscle", () => {
    const loads = activityLoads(activity());
    expect(setsFor(activity(), "quads")).toBe(5);
    expect(loads.map((load) => load.muscle).sort()).toEqual(["abs", "calves", "glutes", "hamstrings", "quads"]);
    for (const load of loads) {
      expect(load.id).toBe("a1");
      expect(load.at).toBe(ENDED_AT);
    }
  });

  it("scales with intensity and duration", () => {
    expect(setsFor(activity({ intensity: "easy" }), "quads")).toBe(3);
    expect(setsFor(activity({ intensity: "hard" }), "quads")).toBe(7);
    expect(setsFor(activity({ durationSeconds: 1800 }), "quads")).toBe(2.5);
    expect(INTENSITY_FACTOR).toEqual({ easy: 0.6, moderate: 1, hard: 1.4 });
  });

  it("caps the load at a fully exhausted muscle", () => {
    const long = activityLoads(activity({ type: "cycling", durationSeconds: 5 * 3600, intensity: "hard" }));
    expect(Math.max(...long.map((load) => load.effectiveSets))).toBe(MAX_EFFECTIVE_SETS);
    for (const load of long) expect(load.effectiveSets).toBeLessThanOrEqual(MAX_EFFECTIVE_SETS);
  });

  it("uses the muscles of each sport", () => {
    expect(setsFor(activity({ type: "rowing" }), "lats")).toBe(5);
    expect(setsFor(activity({ type: "rowing" }), "biceps")).toBeGreaterThan(0);
    expect(setsFor(activity({ type: "swimming" }), "triceps")).toBeGreaterThan(0);
    expect(setsFor(activity({ type: "climbing" }), "forearms")).toBe(5);
    expect(setsFor(activity({ type: "cycling" }), "lats")).toBe(0);
  });

  it("keeps yoga, walking and other sports light", () => {
    for (const type of ["yoga", "walking", "other"] as const) {
      const max = Math.max(...activityLoads(activity({ type })).map((load) => load.effectiveSets));
      expect(max).toBeLessThanOrEqual(2);
      expect(max).toBeGreaterThan(0);
    }
    expect(Object.keys(MUSCLE_SHARES.other).length).toBeGreaterThanOrEqual(6);
  });

  it("knows every activity type and only valid muscles", () => {
    for (const type of ACTIVITY_TYPES) {
      const muscles = Object.keys(MUSCLE_SHARES[type]);
      expect(muscles.length, type).toBeGreaterThan(0);
      for (const muscle of muscles) expect(MUSCLES as readonly string[]).toContain(muscle);
      for (const share of Object.values(MUSCLE_SHARES[type])) {
        expect(share).toBeGreaterThan(0);
        expect(share).toBeLessThanOrEqual(1);
      }
    }
  });

  it("returns nothing for an empty session", () => {
    expect(activityLoads(activity({ durationSeconds: 0 }))).toEqual([]);
  });

  it("lowers the recovery of the used muscles only", () => {
    const now = new Date(ENDED_AT.getTime() + 60 * 60 * 1000);
    const status = recoveryStatus([], () => null, now, {}, activityLoads(activity({ intensity: "hard" })));
    expect(status.quads).toBeLessThan(50);
    expect(status.calves).toBeLessThan(status.abs);
    expect(status.chest).toBe(100);
    // Nach der Rückschau der Erholung ist alles verarbeitet.
    const later = new Date(ENDED_AT.getTime() + 5 * 24 * 60 * 60 * 1000);
    expect(recoveryStatus([], () => null, later, {}, activityLoads(activity({ intensity: "hard" }))).quads).toBe(100);
  });
});

describe("pace and speed", () => {
  it("calculates the pace in seconds per kilometre", () => {
    expect(paceSecondsPerKm(10_000, 3000)).toBe(300);
    expect(paceSecondsPerKm(8200, 2700)).toBe(329);
    expect(paceSecondsPerKm(null, 3000)).toBeNull();
    expect(paceSecondsPerKm(0, 3000)).toBeNull();
    expect(paceSecondsPerKm(5000, 0)).toBeNull();
  });

  it("calculates the speed in km/h", () => {
    expect(speedKmh(30_000, 3600)).toBe(30);
    expect(speedKmh(12_500, 1800)).toBe(25);
    expect(speedKmh(null, 1800)).toBeNull();
    expect(speedKmh(1000, 0)).toBeNull();
  });

  it("shows a pace for running, walking and hiking only", () => {
    expect(usesPace("running")).toBe(true);
    expect(usesPace("walking")).toBe(true);
    expect(usesPace("hiking")).toBe(true);
    expect(usesPace("cycling")).toBe(false);
    expect(usesPace("swimming")).toBe(false);
  });
});
