import { describe, expect, it } from "vitest";
import { EXERCISES, EXERCISES_BY_ID } from "@/data/exercises";
import { EQUIPMENT, MUSCLES, type Equipment, type Muscle } from "@/domain/exercises/types";
import {
  FOCUS_AREAS,
  FOCUS_AREA_MUSCLES,
  FOCUS_MINUTES,
  areaReadiness,
  buildFocusDay,
  interleaveSlots,
  nearestFocusMinutes,
  parseFocusAreas,
  parseFocusMinutes,
  type FocusArea,
} from "@/domain/training/focus-day";
import { avoidedPatterns, isExerciseAvailable } from "@/domain/training/plan-generator";
import { estimateSessionSeconds } from "@/domain/training/plan-generator/prescription";
import type { TrainingProfile } from "@/domain/training/types";

const GYM: Equipment[] = [...EQUIPMENT];
const HOME: Equipment[] = ["dumbbell", "bench", "resistance_band"];
const NOTHING: Equipment[] = [];
const lookup = (id: string) => {
  const exercise = EXERCISES_BY_ID.get(id);
  if (!exercise) throw new Error(`unknown exercise ${id}`);
  return exercise;
};

function profile(overrides: Partial<TrainingProfile> = {}): TrainingProfile {
  return {
    goal: "muscle_gain",
    experience: "intermediate",
    weekdays: [1, 3, 5],
    sessionMinutes: 60,
    equipment: GYM,
    excludedExerciseIds: [],
    injuries: [],
    ...overrides,
  };
}

/** Ob eine Übung die Region primär trainiert. */
function hitsArea(exerciseId: string, area: FocusArea): boolean {
  return lookup(exerciseId).primary.some((muscle) => FOCUS_AREA_MUSCLES[area].includes(muscle));
}

describe("focus training", () => {
  it("trains only the chosen area", () => {
    for (const area of FOCUS_AREAS) {
      for (const equipment of [GYM, HOME, NOTHING]) {
        const day = buildFocusDay([area], profile({ equipment }), EXERCISES, { minutes: 45 });
        // Für die Arme gibt es ohne Geräte nur Trizepsübungen (Bizeps braucht etwas zum Ziehen).
        const minimum = area === "arms" && equipment === NOTHING ? 2 : 3;
        expect(day.length, `${area} with ${equipment.join("+") || "nothing"}`).toBeGreaterThanOrEqual(minimum);
        for (const planned of day) expect(hitsArea(planned.exerciseId, area), `${area}: ${planned.exerciseId}`).toBe(true);
      }
    }
  });

  it("never repeats an exercise within the session", () => {
    for (const area of FOCUS_AREAS) {
      const ids = buildFocusDay([area], profile(), EXERCISES, { minutes: 90 }).map((planned) => planned.exerciseId);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives every chosen area an exercise even when time is short", () => {
    const areas: FocusArea[] = ["chest", "arms", "core"];
    const day = buildFocusDay(areas, profile(), EXERCISES, { minutes: 20 });
    for (const area of areas) expect(day.some((planned) => hitsArea(planned.exerciseId, area)), area).toBe(true);
  });

  it("stays within the chosen duration", () => {
    for (const minutes of FOCUS_MINUTES) {
      for (const experience of ["beginner", "intermediate", "advanced"] as const) {
        const day = buildFocusDay(["legs", "back"], profile({ experience }), EXERCISES, { minutes });
        expect(estimateSessionSeconds(day)).toBeLessThanOrEqual(minutes * 60);
      }
    }
  });

  it("plans more exercises for longer sessions", () => {
    const short = buildFocusDay(["legs"], profile(), EXERCISES, { minutes: 30 });
    const long = buildFocusDay(["legs"], profile(), EXERCISES, { minutes: 75 });
    expect(long.length).toBeGreaterThan(short.length);
  });

  it("puts compound exercises first", () => {
    const day = buildFocusDay(["arms", "chest"], profile(), EXERCISES, { minutes: 60 });
    expect(lookup(day[0].exerciseId).mechanic).toBe("compound");
    const firstAccessory = day.findIndex((planned) => lookup(planned.exerciseId).mechanic !== "compound");
    const lastCompound = day.findLastIndex((planned) => lookup(planned.exerciseId).mechanic === "compound");
    expect(lastCompound).toBeLessThan(firstAccessory === -1 ? Infinity : firstAccessory);
  });

  it("respects equipment, exclusions and injuries", () => {
    const home = buildFocusDay(["chest", "back"], profile({ equipment: HOME }), EXERCISES, { minutes: 60 });
    for (const planned of home) expect(isExerciseAvailable(lookup(planned.exerciseId), HOME)).toBe(true);

    const first = buildFocusDay(["chest"], profile(), EXERCISES, { minutes: 45 })[0].exerciseId;
    const without = buildFocusDay(["chest"], profile({ excludedExerciseIds: [first] }), EXERCISES, { minutes: 45 });
    expect(without.map((planned) => planned.exerciseId)).not.toContain(first);

    const avoided = avoidedPatterns(["shoulder"]);
    const injured = buildFocusDay(["shoulders"], profile({ injuries: ["shoulder"] }), EXERCISES, { minutes: 45 });
    for (const planned of injured) expect(avoided.has(lookup(planned.exerciseId).pattern)).toBe(false);
  });

  it("is deterministic and empty without an area", () => {
    const first = buildFocusDay(["glutes", "core"], profile(), EXERCISES, { minutes: 45 });
    expect(buildFocusDay(["glutes", "core"], profile(), EXERCISES, { minutes: 45 })).toEqual(first);
    expect(buildFocusDay([], profile(), EXERCISES, { minutes: 45 })).toEqual([]);
  });

  it("interleaves the slots of several areas", () => {
    const slots = interleaveSlots(["chest", "arms"]);
    expect(slots[0].patterns[0]).toBe("horizontal_push");
    expect(slots[1].patterns[0]).toBe("elbow_flexion");
  });
});

describe("focus training input", () => {
  it("reads areas in a fixed order without duplicates or unknown values", () => {
    expect(parseFocusAreas("arms,chest,arms,nonsense")).toEqual(["chest", "arms"]);
    expect(parseFocusAreas(["legs", "core"])).toEqual(["core", "legs"]);
    expect(parseFocusAreas(undefined)).toEqual([]);
  });

  it("reads the duration and ignores invalid values", () => {
    expect(parseFocusMinutes("30")).toBe(30);
    expect(parseFocusMinutes("31")).toBeNull();
    expect(parseFocusMinutes(undefined)).toBeNull();
  });

  it("maps the profile duration to the nearest option", () => {
    expect(nearestFocusMinutes(60)).toBe(60);
    expect(nearestFocusMinutes(25)).toBe(20);
    expect(nearestFocusMinutes(120)).toBe(90);
  });

  it("averages the recovery of an area", () => {
    const recovery = Object.fromEntries(MUSCLES.map((muscle) => [muscle, 100])) as Record<Muscle, number>;
    expect(areaReadiness("arms", { ...recovery, biceps: 40, triceps: 70 })).toBe(70);
    expect(areaReadiness("chest", { ...recovery, chest: 55 })).toBe(55);
  });
});
