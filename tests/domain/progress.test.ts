import { describe, expect, it } from "vitest";
import { EXERCISES_BY_ID } from "@/data/exercises";
import {
  areaDistribution,
  mostUsedExercises,
  setsPerMuscle,
  trainingDaysPerMuscle,
  weeklySetsForMuscle,
} from "@/domain/progress/muscle-load";
import { intensityFactor, recoveryLevel, recoveryStatus } from "@/domain/progress/recovery";
import { periodReport } from "@/domain/progress/reports";
import {
  LIFT_EXERCISE_IDS,
  STRENGTH_LIFTS,
  detectPlateau,
  exerciseSeries,
  rateStrength,
  type SessionPoint,
} from "@/domain/progress/strength";
import type { TrainedSet } from "@/domain/progress/types";
import { addDays } from "@/lib/dates";

const lookup = (id: string) => EXERCISES_BY_ID.get(id);
const BENCH = "barbell-bench-press";
const SQUAT = "barbell-back-squat";
// 2026-11-16 ist ein Montag.
const MON = "2026-11-16";

function set(overrides: Partial<TrainedSet> = {}): TrainedSet {
  const date = overrides.date ?? MON;
  return {
    exerciseId: BENCH,
    sessionId: `session-${date}`,
    date,
    completedAt: new Date(`${date}T18:00:00Z`),
    type: "work",
    weightKg: 80,
    reps: 8,
    rir: 2,
    ...overrides,
  };
}
const sets = (count: number, overrides: Partial<TrainedSet> = {}) =>
  Array.from({ length: count }, () => set(overrides));
const hoursAfter = (date: string, hours: number) => new Date(new Date(`${date}T18:00:00Z`).getTime() + hours * 3_600_000);

describe("muscle load", () => {
  it("counts primary muscles fully and secondary muscles half", () => {
    const totals = setsPerMuscle(sets(4), lookup, MON, MON);
    expect(totals.chest).toBe(4);
    expect(totals.triceps).toBe(2);
    expect(totals.quads).toBe(0);
  });

  it("ignores warm-up sets, empty sets and other dates", () => {
    const data = [set({ type: "warmup" }), set({ reps: 0 }), set({ date: addDays(MON, -1) }), set()];
    expect(setsPerMuscle(data, lookup, MON, MON).chest).toBe(1);
  });

  it("groups sets by calendar week", () => {
    const data = [...sets(3), ...sets(5, { date: addDays(MON, -7) }), ...sets(2, { date: addDays(MON, 6) })];
    const weeks = weeklySetsForMuscle(data, lookup, "chest", addDays(MON, 3), 3);
    expect(weeks.map((week) => week.weekStart)).toEqual([addDays(MON, -14), addDays(MON, -7), MON]);
    expect(weeks.map((week) => week.sets)).toEqual([0, 5, 5]);
  });

  it("counts training days per primary muscle", () => {
    const data = [...sets(3), ...sets(3, { date: addDays(MON, 2) }), set({ exerciseId: SQUAT })];
    const days = trainingDaysPerMuscle(data, lookup, MON, addDays(MON, 6));
    expect(days.chest).toBe(2);
    expect(days.quads).toBe(1);
    expect(days.triceps).toBe(0);
  });

  it("splits the volume into body areas", () => {
    const totals = setsPerMuscle([...sets(4), ...sets(4, { exerciseId: SQUAT })], lookup, MON, MON);
    const areas = areaDistribution(totals);
    expect(areas.push + areas.pull + areas.core + areas.legs).toBeCloseTo(1, 10);
    expect(areas.push).toBeGreaterThan(0.3);
    expect(areas.legs).toBeGreaterThan(0.3);
    expect(areaDistribution(setsPerMuscle([], lookup, MON, MON)).legs).toBe(0);
  });

  it("ranks the most used exercises", () => {
    const data = [...sets(3), ...sets(3, { date: addDays(MON, 2) }), ...sets(4, { exerciseId: SQUAT })];
    expect(mostUsedExercises(data, 1)).toEqual([{ exerciseId: BENCH, sets: 6, sessions: 2 }]);
  });
});

describe("recovery", () => {
  it("is fully recovered without training", () => {
    expect(recoveryStatus([], lookup, new Date()).chest).toBe(100);
  });

  it("drops right after training and returns to 100 % over time", () => {
    const data = sets(5, { rir: 1 });
    const after = (hours: number) => recoveryStatus(data, lookup, hoursAfter(MON, hours));
    expect(after(0).chest).toBe(50);
    expect(after(0).triceps).toBe(75);
    expect(after(0).quads).toBe(100);
    expect(after(24).chest).toBe(75);
    expect(after(48).chest).toBe(100);
  });

  it("takes longer to recover from more volume", () => {
    const light = recoveryStatus(sets(3, { rir: 1 }), lookup, hoursAfter(MON, 24)).chest;
    const heavy = recoveryStatus(sets(10, { rir: 1 }), lookup, hoursAfter(MON, 24)).chest;
    expect(heavy).toBeLessThan(light);
    expect(recoveryStatus(sets(20, { rir: 1 }), lookup, hoursAfter(MON, 0)).chest).toBe(0);
    expect(recoveryStatus(sets(10, { rir: 1 }), lookup, hoursAfter(MON, 72)).chest).toBe(100);
  });

  it("weights easy sets less than hard ones", () => {
    expect(intensityFactor({ rir: 5, type: "work" })).toBeLessThan(intensityFactor({ rir: 0, type: "work" }));
    expect(intensityFactor({ rir: 3, type: "failure" })).toBeGreaterThan(1);
    const easy = recoveryStatus(sets(5, { rir: 4 }), lookup, hoursAfter(MON, 0)).chest;
    const hard = recoveryStatus(sets(5, { rir: 0 }), lookup, hoursAfter(MON, 0)).chest;
    expect(easy).toBeGreaterThan(hard);
  });

  it("adds up the fatigue of several sessions", () => {
    const data = [...sets(5, { rir: 1 }), ...sets(5, { rir: 1, date: addDays(MON, 1) })];
    const combined = recoveryStatus(data, lookup, hoursAfter(addDays(MON, 1), 0)).chest;
    expect(combined).toBe(25);
  });

  it("ignores sets that lie in the future", () => {
    expect(recoveryStatus(sets(5), lookup, hoursAfter(MON, -1)).chest).toBe(100);
  });

  it("lets a manual value replace earlier training but not later training", () => {
    const data = sets(10, { rir: 1 });
    const corrected = recoveryStatus(data, lookup, hoursAfter(MON, 2), {
      chest: { percent: 100, setAt: hoursAfter(MON, 1) },
    });
    expect(corrected.chest).toBe(100);
    expect(corrected.triceps).toBeLessThan(100);

    const sore = recoveryStatus([], lookup, hoursAfter(MON, 0), { quads: { percent: 40, setAt: hoursAfter(MON, 0) } });
    expect(sore.quads).toBe(40);

    const later = recoveryStatus([...data, ...sets(5, { rir: 1, date: addDays(MON, 3) })], lookup, hoursAfter(addDays(MON, 3), 0), {
      chest: { percent: 100, setAt: hoursAfter(MON, 1) },
    });
    expect(later.chest).toBe(50);
  });

  it("labels the status", () => {
    expect(recoveryLevel(100)).toBe("fresh");
    expect(recoveryLevel(60)).toBe("recovering");
    expect(recoveryLevel(20)).toBe("fatigued");
  });
});

describe("strength", () => {
  it("builds one point per session with the best estimate", () => {
    const data = [
      set({ weightKg: 80, reps: 8 }),
      set({ weightKg: 85, reps: 5 }),
      set({ type: "warmup", weightKg: 200, reps: 1 }),
      set({ date: addDays(MON, 7), weightKg: 90, reps: 5, rir: null }),
      set({ exerciseId: SQUAT, weightKg: 150, reps: 5 }),
    ];
    const series = exerciseSeries(data, BENCH);
    expect(series.map((point) => point.date)).toEqual([MON, addDays(MON, 7)]);
    expect(series[0]).toMatchObject({ sets: 2, bestWeightKg: 85, bestReps: 8, volumeKg: 80 * 8 + 85 * 5, avgRir: 2 });
    expect(series[0].oneRepMaxKg).toBeCloseTo(80 * (1 + 8 / 30), 5);
    expect(series[1].avgRir).toBeNull();
  });

  it("has no one-rep max for exercises without weight", () => {
    const [point] = exerciseSeries([set({ exerciseId: "push-up", weightKg: null, reps: 20 })], "push-up");
    expect(point).toMatchObject({ oneRepMaxKg: null, bestWeightKg: null, bestReps: 20, volumeKg: 0 });
  });

  it("uses exercises that exist in the catalogue for the strength levels", () => {
    for (const lift of STRENGTH_LIFTS) {
      for (const id of LIFT_EXERCISE_IDS[lift]) expect(EXERCISES_BY_ID.has(id), id).toBe(true);
    }
  });

  it("rates strength relative to body weight", () => {
    expect(rateStrength("bench", 30, 80, "male")).toMatchObject({ level: "untrained", nextRatio: 0.5 });
    expect(rateStrength("bench", 80, 80, "male").level).toBe("intermediate");
    expect(rateStrength("bench", 160, 80, "male")).toMatchObject({ level: "elite", nextRatio: null });
    expect(rateStrength("bench", 60, 60, "female").level).toBe("advanced");
    expect(rateStrength("squat", 100, 0, "male").ratio).toBe(0);
  });
});

describe("plateau detection", () => {
  const point = (dayOffset: number, oneRepMaxKg: number, extra: Partial<SessionPoint> = {}): SessionPoint => ({
    sessionId: `s${dayOffset}`,
    date: addDays(MON, dayOffset),
    oneRepMaxKg,
    volumeKg: 1000,
    bestWeightKg: 80,
    bestReps: 8,
    sets: 4,
    avgRir: 2,
    minAssistanceKg: null,
    repsAtMinAssistance: null,
    ...extra,
  });
  const stalled = (extra: Partial<SessionPoint> = {}) => [0, 7, 14, 21, 28, 35].map((day) => point(day, 100, extra));

  it("finds a stall over several weeks", () => {
    expect(detectPlateau(stalled())).toEqual({ days: 35, suggestion: "variation" });
  });

  it("reports nothing while the estimate still rises", () => {
    const rising = [0, 7, 14, 21, 28, 35].map((day, index) => point(day, 100 + index * 2));
    expect(detectPlateau(rising)).toBeNull();
  });

  it("needs enough sessions and enough time", () => {
    expect(detectPlateau(stalled().slice(0, 5))).toBeNull();
    const quick = [0, 1, 2, 3, 4, 5].map((day) => point(day, 100));
    expect(detectPlateau(quick)).toBeNull();
  });

  it("suggests a deload after hard sessions and more volume after few sets", () => {
    expect(detectPlateau(stalled({ avgRir: 0.5 }))?.suggestion).toBe("deload");
    expect(detectPlateau(stalled({ sets: 2 }))?.suggestion).toBe("volume");
  });

  describe("assisted exercises", () => {
    const assisted = (kgs: number[], reps = 8) =>
      [0, 7, 14, 21, 28, 35].map((day, index) =>
        point(day, 0, { oneRepMaxKg: null, minAssistanceKg: kgs[index], repsAtMinAssistance: reps }),
      );

    it("treats less assistance as progress", () => {
      expect(detectPlateau(assisted([40, 40, 40, 35, 35, 30]))).toBeNull();
    });

    it("finds a stall or a step back when assistance stays or rises", () => {
      expect(detectPlateau(assisted([30, 30, 30, 30, 30, 30]))).toEqual({ days: 35, suggestion: "variation" });
      // Regressionstest: Mehr Unterstützung ist kein Fortschritt.
      expect(detectPlateau(assisted([30, 30, 30, 35, 40, 45]))).not.toBeNull();
    });

    it("counts more reps at the same assistance as progress", () => {
      const series = assisted([30, 30, 30, 30, 30, 30]);
      series[5] = { ...series[5], repsAtMinAssistance: 10 };
      expect(detectPlateau(series)).toBeNull();
    });
  });
});

describe("assisted exercise series", () => {
  const ASSISTED = "assisted-pull-up-machine";

  it("records the least assistance and no load or volume", () => {
    const data = [
      set({ exerciseId: ASSISTED, weightKg: 35, reps: 10 }),
      set({ exerciseId: ASSISTED, weightKg: 30, reps: 6 }),
      set({ exerciseId: ASSISTED, weightKg: 30, reps: 8 }),
    ];
    const [point] = exerciseSeries(data, ASSISTED, "assisted_bodyweight");
    expect(point).toMatchObject({
      oneRepMaxKg: null,
      volumeKg: 0,
      bestWeightKg: null,
      minAssistanceKg: 30,
      repsAtMinAssistance: 8,
    });
  });
});

describe("period report", () => {
  it("summarises workouts, volume and new bests", () => {
    const from = "2026-11-01";
    const to = "2026-11-30";
    const sessions = [
      { id: "a", date: "2026-10-20", durationMinutes: 50 },
      { id: "b", date: "2026-11-03", durationMinutes: 60 },
      { id: "c", date: "2026-11-10", durationMinutes: null },
      { id: "d", date: "2026-11-10", durationMinutes: 30 },
    ];
    const all = [
      set({ date: "2026-10-20", sessionId: "a", weightKg: 80, reps: 8 }),
      set({ date: "2026-11-03", sessionId: "b", weightKg: 85, reps: 8 }),
      set({ date: "2026-11-10", sessionId: "c", weightKg: 60, reps: 10 }),
      set({ date: "2026-11-10", sessionId: "d", exerciseId: SQUAT, weightKg: 100, reps: 5 }),
      set({ date: "2026-11-10", sessionId: "d", type: "warmup", weightKg: 300, reps: 1 }),
    ];
    const report = periodReport(sessions, all, from, to);
    expect(report).toMatchObject({
      workouts: 3,
      trainingDays: 2,
      totalMinutes: 90,
      sets: 3,
      volumeKg: 85 * 8 + 60 * 10 + 100 * 5,
      improvedExercises: [BENCH],
      busiestMonth: 11,
    });
    expect(report.topExercises[0]).toEqual({ exerciseId: BENCH, sets: 2, sessions: 2 });
  });

  it("leaves assistance out of the volume and counts less assistance as an improvement", () => {
    const ASSISTED = "assisted-pull-up-machine";
    const all = [
      set({ date: "2026-10-20", sessionId: "a", exerciseId: ASSISTED, weightKg: 30, reps: 8 }),
      set({ date: "2026-11-03", sessionId: "b", exerciseId: ASSISTED, weightKg: 25, reps: 8 }),
      set({ date: "2026-11-03", sessionId: "b", weightKg: 80, reps: 5 }),
    ];
    const sessions = [{ id: "b", date: "2026-11-03", durationMinutes: 60 }];
    const report = periodReport(sessions, all, "2026-11-01", "2026-11-30", lookup);
    expect(report.volumeKg).toBe(80 * 5);
    expect(report.improvedExercises).toEqual([ASSISTED]);
    // Mehr Unterstützung ist keine Verbesserung.
    const worse = all.map((item) => (item.sessionId === "b" && item.exerciseId === ASSISTED ? { ...item, weightKg: 40 } : item));
    expect(periodReport(sessions, worse, "2026-11-01", "2026-11-30", lookup).improvedExercises).toEqual([]);
  });

  it("is empty for a period without training", () => {
    expect(periodReport([], [], "2026-01-01", "2026-01-31")).toMatchObject({
      workouts: 0,
      volumeKg: 0,
      improvedExercises: [],
      busiestMonth: null,
    });
  });
});
