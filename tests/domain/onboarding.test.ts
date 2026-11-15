import { describe, expect, it } from "vitest";
import { EXERCISES, EXERCISES_BY_ID } from "@/data/exercises";
import { EQUIPMENT } from "@/domain/exercises/types";
import {
  MAX_BODY_FAT,
  MIN_BODY_FAT,
  SELF_ASSESSMENTS,
  assessmentFromExperience,
  bodyFatBand,
  defaultWeekdays,
  estimateBodyFat,
  experienceFromAssessment,
  isGoalAdvisable,
  moveTrainingDay,
  recommendedDayCounts,
  suggestAssessment,
  toggleFocusMuscle,
} from "@/domain/training/onboarding";
import { MAX_FOCUS_SETS, generatePlan } from "@/domain/training/plan-generator";
import { estimateSessionSeconds } from "@/domain/training/plan-generator/prescription";
import { EXPERIENCE_LEVELS, MAX_TRAINING_DAYS, MIN_TRAINING_DAYS, type TrainingProfile } from "@/domain/training/types";

describe("self assessment", () => {
  it("maps every assessment to an experience level and back", () => {
    for (const assessment of SELF_ASSESSMENTS) {
      expect(EXPERIENCE_LEVELS).toContain(experienceFromAssessment(assessment));
    }
    for (const level of EXPERIENCE_LEVELS) {
      expect(experienceFromAssessment(assessmentFromExperience(level))).toBe(level);
    }
  });

  it("suggests a level from training age and consistency", () => {
    expect(suggestAssessment(0, true)).toBe("newcomer");
    expect(suggestAssessment(3, false)).toBe("newcomer");
    expect(suggestAssessment(24, false)).toBe("returner");
    expect(suggestAssessment(8, true)).toBe("beginner");
    expect(suggestAssessment(24, true)).toBe("average");
    expect(suggestAssessment(48, true)).toBe("advanced");
    expect(suggestAssessment(120, true)).toBe("elite");
  });
});

describe("body fat estimate", () => {
  it("estimates higher values for women and for higher weight", () => {
    const base = { ageYears: 35, heightCm: 175, weightKg: 75 };
    const male = estimateBodyFat({ sex: "male", ...base });
    const female = estimateBodyFat({ sex: "female", ...base });
    expect(male).toBe(21);
    expect(female).toBe(32);
    expect(estimateBodyFat({ sex: "male", ...base, weightKg: 95 })).toBeGreaterThan(male);
  });

  it("stays within the selectable range", () => {
    expect(estimateBodyFat({ sex: "male", ageYears: 18, heightCm: 200, weightKg: 45 })).toBe(MIN_BODY_FAT);
    expect(estimateBodyFat({ sex: "female", ageYears: 80, heightCm: 150, weightKg: 200 })).toBe(MAX_BODY_FAT);
  });

  it("sorts values into bands per sex", () => {
    expect(bodyFatBand("male", 9)).toBe("athletic");
    expect(bodyFatBand("male", 20)).toBe("average");
    expect(bodyFatBand("female", 20)).toBe("fit");
    expect(bodyFatBand("female", 45)).toBe("very_high");
  });

  it("flags goals that do not fit the body fat", () => {
    expect(isGoalAdvisable("muscle_gain", "female", 34)).toBe(false);
    expect(isGoalAdvisable("maintain", "female", 34)).toBe(false);
    expect(isGoalAdvisable("fat_loss", "female", 34)).toBe(true);
    expect(isGoalAdvisable("recomposition", "female", 34)).toBe(true);
    expect(isGoalAdvisable("fat_loss", "male", 8)).toBe(false);
    expect(isGoalAdvisable("muscle_gain", "male", 8)).toBe(true);
    expect(isGoalAdvisable("muscle_gain", "male", null)).toBe(true);
  });
});

describe("week planning", () => {
  it("offers default weekdays for every allowed number of days", () => {
    for (let count = MIN_TRAINING_DAYS; count <= MAX_TRAINING_DAYS; count++) {
      const days = defaultWeekdays(count);
      expect(days).toHaveLength(count);
      expect(new Set(days).size).toBe(count);
    }
    expect(() => defaultWeekdays(7)).toThrow(RangeError);
  });

  it("recommends day counts within the allowed range", () => {
    for (const level of EXPERIENCE_LEVELS) {
      for (const count of recommendedDayCounts(level)) {
        expect(count).toBeGreaterThanOrEqual(MIN_TRAINING_DAYS);
        expect(count).toBeLessThanOrEqual(MAX_TRAINING_DAYS);
      }
    }
  });

  it("moves a training to a free day only", () => {
    expect(moveTrainingDay([1, 3, 5], 3, 2)).toEqual([1, 2, 5]);
    expect(moveTrainingDay([1, 3, 5], 1, 7)).toEqual([3, 5, 7]);
    expect(moveTrainingDay([1, 3, 5], 3, 5)).toEqual([1, 3, 5]);
    expect(moveTrainingDay([1, 3, 5], 2, 4)).toEqual([1, 3, 5]);
  });
});

describe("focus muscles", () => {
  it("allows at most two", () => {
    expect(toggleFocusMuscle([], "glutes")).toEqual(["glutes"]);
    expect(toggleFocusMuscle(["glutes"], "glutes")).toEqual([]);
    expect(toggleFocusMuscle(["glutes", "chest"], "lats")).toEqual(["glutes", "chest", "lats"]);
    expect(toggleFocusMuscle(["glutes", "chest", "lats"], "biceps")).toBeNull();
    expect(toggleFocusMuscle(["glutes", "chest"], "chest")).toEqual(["glutes"]);
  });

  const profile: TrainingProfile = {
    goal: "muscle_gain",
    experience: "intermediate",
    weekdays: [1, 3, 5],
    sessionMinutes: 75,
    equipment: [...EQUIPMENT],
    excludedExerciseIds: [],
    injuries: [],
  };

  it("adds sets for focus muscles without exceeding the session length", () => {
    const base = generatePlan(profile, EXERCISES);
    const focused = generatePlan({ ...profile, focusMuscles: ["glutes", "chest"] }, EXERCISES);

    let added = 0;
    focused.days.forEach((day, dayIndex) => {
      expect(estimateSessionSeconds(day.exercises)).toBeLessThanOrEqual(profile.sessionMinutes * 60);
      day.exercises.forEach((entry, index) => {
        const before = base.days[dayIndex].exercises[index];
        expect(entry.exerciseId).toBe(before.exerciseId);
        const primary = EXERCISES_BY_ID.get(entry.exerciseId)?.primary ?? [];
        const isFocus = primary.includes("glutes") || primary.includes("chest");
        expect(entry.sets - before.sets).toBeGreaterThanOrEqual(0);
        expect(entry.sets).toBeLessThanOrEqual(Math.max(before.sets, MAX_FOCUS_SETS));
        if (!isFocus) expect(entry.sets).toBe(before.sets);
        added += entry.sets - before.sets;
      });
    });
    expect(added).toBeGreaterThan(0);
  });

  it("leaves the plan unchanged without focus muscles", () => {
    expect(generatePlan({ ...profile, focusMuscles: [] }, EXERCISES)).toEqual(generatePlan(profile, EXERCISES));
  });
});
