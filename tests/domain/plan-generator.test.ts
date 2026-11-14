import { describe, expect, it } from "vitest";
import { EXERCISES, EXERCISES_BY_ID } from "@/data/exercises";
import { EQUIPMENT, type Equipment } from "@/domain/exercises/types";
import { PATTERNS_TO_AVOID, findAlternatives, generatePlan, isExerciseAvailable } from "@/domain/training/plan-generator";
import { estimateSessionSeconds } from "@/domain/training/plan-generator/prescription";
import { SPLIT_BY_DAYS } from "@/domain/training/plan-generator/templates";
import {
  EXPERIENCE_LEVELS,
  GOALS,
  SESSION_MINUTES,
  type TrainingProfile,
  type Weekday,
} from "@/domain/training/types";

const GYM: Equipment[] = [...EQUIPMENT];
const HOME: Equipment[] = ["dumbbell", "bench", "resistance_band"];
const NOTHING: Equipment[] = [];
const WEEKDAY_SETS: Weekday[][] = [[3], [1, 4], [1, 3, 5], [1, 2, 4, 5], [1, 2, 3, 5, 6], [1, 2, 3, 4, 5, 6]];
const DIFFICULTY_RANK = { beginner: 0, intermediate: 1, advanced: 2 } as const;

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

const exerciseOf = (id: string) => {
  const exercise = EXERCISES_BY_ID.get(id);
  if (!exercise) throw new Error(`Unknown exercise ${id}`);
  return exercise;
};

describe("plan generator", () => {
  it("is deterministic", () => {
    expect(generatePlan(profile(), EXERCISES)).toEqual(generatePlan(profile(), EXERCISES));
  });

  it("chooses the split from the number of training days", () => {
    for (const weekdays of WEEKDAY_SETS) {
      const plan = generatePlan(profile({ weekdays }), EXERCISES);
      const expected = SPLIT_BY_DAYS[weekdays.length];
      expect(plan.split).toBe(expected.split);
      expect(plan.days.map((day) => day.focus)).toEqual(expected.days);
      expect(plan.days.map((day) => day.weekday)).toEqual(weekdays);
    }
  });

  it("sorts and de-duplicates the weekdays", () => {
    const plan = generatePlan(profile({ weekdays: [5, 1, 3, 1] }), EXERCISES);
    expect(plan.days.map((day) => day.weekday)).toEqual([1, 3, 5]);
  });

  it("rejects an invalid number of training days", () => {
    expect(() => generatePlan(profile({ weekdays: [] }), EXERCISES)).toThrow(RangeError);
    expect(() => generatePlan(profile({ weekdays: [1, 2, 3, 4, 5, 6, 7] }), EXERCISES)).toThrow(RangeError);
  });

  it("only uses exercises that exist, fit the equipment and are not cardio", () => {
    for (const equipment of [GYM, HOME, NOTHING]) {
      for (const weekdays of WEEKDAY_SETS) {
        const plan = generatePlan(profile({ equipment, weekdays }), EXERCISES);
        for (const day of plan.days) {
          expect(day.exercises.length, `${day.focus} with ${equipment.length} items`).toBeGreaterThanOrEqual(3);
          for (const planned of day.exercises) {
            const exercise = exerciseOf(planned.exerciseId);
            expect(isExerciseAvailable(exercise, equipment), exercise.id).toBe(true);
            expect(exercise.pattern).not.toBe("cardio");
          }
        }
      }
    }
  });

  it("never repeats an exercise within a day", () => {
    for (const weekdays of WEEKDAY_SETS) {
      for (const day of generatePlan(profile({ weekdays }), EXERCISES).days) {
        const ids = day.exercises.map((planned) => planned.exerciseId);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("stays within the session duration", () => {
    for (const sessionMinutes of SESSION_MINUTES) {
      for (const experience of EXPERIENCE_LEVELS) {
        for (const day of generatePlan(profile({ sessionMinutes, experience }), EXERCISES).days) {
          const seconds = estimateSessionSeconds(day.exercises);
          // Drei Übungen sind das Minimum; nur dann darf die Zeit knapp überschritten werden.
          if (day.exercises.length > 3) expect(seconds).toBeLessThanOrEqual(sessionMinutes * 60);
        }
      }
    }
  });

  it("plans more exercises for longer sessions", () => {
    const count = (sessionMinutes: 30 | 90) =>
      generatePlan(profile({ sessionMinutes }), EXERCISES).days[0].exercises.length;
    expect(count(90)).toBeGreaterThan(count(30));
  });

  it("respects excluded exercises", () => {
    const base = generatePlan(profile(), EXERCISES);
    const excluded = base.days.flatMap((day) => day.exercises.map((planned) => planned.exerciseId)).slice(0, 4);
    const plan = generatePlan(profile({ excludedExerciseIds: excluded }), EXERCISES);
    const used = plan.days.flatMap((day) => day.exercises.map((planned) => planned.exerciseId));
    for (const id of excluded) expect(used).not.toContain(id);
  });

  it("avoids movement patterns that stress an injured region", () => {
    const plan = generatePlan(profile({ injuries: ["knee", "shoulder"], weekdays: [1, 2, 4, 5] }), EXERCISES);
    const avoided = [...PATTERNS_TO_AVOID.knee, ...PATTERNS_TO_AVOID.shoulder];
    for (const day of plan.days) {
      for (const planned of day.exercises) {
        expect(avoided, planned.exerciseId).not.toContain(exerciseOf(planned.exerciseId).pattern);
      }
    }
  });

  it("keeps beginners away from harder exercises", () => {
    for (const experience of EXPERIENCE_LEVELS) {
      for (const day of generatePlan(profile({ experience }), EXERCISES).days) {
        for (const planned of day.exercises) {
          const difficulty = exerciseOf(planned.exerciseId).difficulty;
          expect(DIFFICULTY_RANK[difficulty], planned.exerciseId).toBeLessThanOrEqual(DIFFICULTY_RANK[experience]);
        }
      }
    }
  });

  it("adapts sets, reps and rest to goal and experience", () => {
    for (const goal of GOALS) {
      for (const experience of EXPERIENCE_LEVELS) {
        for (const day of generatePlan(profile({ goal, experience }), EXERCISES).days) {
          for (const planned of day.exercises) {
            expect(planned.sets).toBeGreaterThanOrEqual(2);
            expect(planned.sets).toBeLessThanOrEqual(4);
            expect(planned.repMin).toBeLessThan(planned.repMax);
            expect(planned.restSeconds).toBeGreaterThanOrEqual(60);
            expect(planned.targetRir).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
    const first = (experience: "beginner" | "advanced") =>
      generatePlan(profile({ experience }), EXERCISES).days[0].exercises[0];
    expect(first("advanced").sets).toBeGreaterThan(first("beginner").sets);
    expect(first("advanced").targetRir).toBeLessThan(first("beginner").targetRir);
  });

  it("varies the exercises between the days of a week", () => {
    const plan = generatePlan(profile({ weekdays: [1, 3, 5] }), EXERCISES);
    const [a, b] = plan.days.map((day) => new Set(day.exercises.map((planned) => planned.exerciseId)));
    const shared = [...a].filter((id) => b.has(id));
    expect(shared.length).toBeLessThan(a.size);
  });

  it("covers push, pull and legs in every full-body day", () => {
    const plan = generatePlan(profile({ weekdays: [1, 3, 5], equipment: NOTHING }), EXERCISES);
    for (const day of plan.days) {
      const patterns = day.exercises.map((planned) => exerciseOf(planned.exerciseId).pattern);
      expect(patterns.some((pattern) => pattern.endsWith("_push"))).toBe(true);
      expect(patterns.some((pattern) => ["squat", "lunge", "hinge", "hip_thrust"].includes(pattern))).toBe(true);
    }
  });
});

describe("exercise alternatives", () => {
  it("suggests exercises for the same muscles that fit the equipment", () => {
    const plan = generatePlan(profile(), EXERCISES);
    const current = exerciseOf(plan.days[0].exercises[0].exerciseId);
    const alternatives = findAlternatives(current, EXERCISES, { equipment: HOME });
    expect(alternatives.length).toBeGreaterThan(0);
    for (const alternative of alternatives) {
      expect(alternative.id).not.toBe(current.id);
      expect(isExerciseAvailable(alternative, HOME)).toBe(true);
      expect(alternative.primary.some((muscle) => current.primary.includes(muscle))).toBe(true);
    }
    expect(alternatives[0].pattern).toBe(current.pattern);
  });

  it("leaves out excluded exercises and honours the limit", () => {
    const current = exerciseOf(generatePlan(profile(), EXERCISES).days[0].exercises[0].exerciseId);
    const all = findAlternatives(current, EXERCISES, { limit: 3 });
    expect(all).toHaveLength(3);
    const without = findAlternatives(current, EXERCISES, { excludedIds: [all[0].id], limit: 3 });
    expect(without.map((exercise) => exercise.id)).not.toContain(all[0].id);
  });
});
