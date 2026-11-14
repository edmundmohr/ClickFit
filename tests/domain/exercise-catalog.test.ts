import { describe, expect, it } from "vitest";
import { EXERCISES } from "@/data/exercises";
import {
  DIFFICULTIES,
  EQUIPMENT,
  EXERCISE_TYPES,
  MECHANICS,
  MOVEMENT_PATTERNS,
  MUSCLES,
  type Equipment,
  type MovementPattern,
} from "@/domain/exercises/types";

const MIN_EXERCISES = 150;
const MIN_PRIMARY_PER_MUSCLE = 3;
/** Muster, die auch zu Hause oder unterwegs ohne Geräte (höchstens mit Band) abgedeckt sein müssen. */
const PATTERNS_NEEDED_WITHOUT_GEAR: MovementPattern[] = [
  "horizontal_push",
  "vertical_push",
  "horizontal_pull",
  "vertical_pull",
  "squat",
  "hinge",
  "lunge",
  "hip_thrust",
  "calf_raise",
  "core_flexion",
  "core_stability",
];
const MINIMAL_GEAR: Equipment[] = ["resistance_band"];
/** Typische Fehler und Kurzbefehle: je Übung 2 bis 4 Einträge. */
const MIN_COACHING_ITEMS = 2;
const MAX_COACHING_ITEMS = 4;
/** Kurzbefehle müssen sich im Training mit einem Blick lesen lassen. */
const MAX_CUE_WORDS = 6;

describe("exercise catalogue", () => {
  it("contains enough exercises with unique kebab-case ids", () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(MIN_EXERCISES);
    const ids = EXERCISES.map((exercise) => exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("has unique names", () => {
    const names = EXERCISES.map((exercise) => exercise.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("uses only known values and complete data", () => {
    for (const exercise of EXERCISES) {
      const label = exercise.id;
      expect(EXERCISE_TYPES, label).toContain(exercise.type);
      expect(MECHANICS, label).toContain(exercise.mechanic);
      expect(MOVEMENT_PATTERNS, label).toContain(exercise.pattern);
      expect(DIFFICULTIES, label).toContain(exercise.difficulty);
      expect([1, 2, 3], label).toContain(exercise.priority);
      expect(exercise.name.trim().length, label).toBeGreaterThan(2);
      expect(exercise.primary.length, label).toBeGreaterThan(0);
      for (const muscle of [...exercise.primary, ...exercise.secondary]) {
        expect(MUSCLES, label).toContain(muscle);
      }
      expect(new Set(exercise.primary).size, label).toBe(exercise.primary.length);
      for (const muscle of exercise.secondary) expect(exercise.primary, label).not.toContain(muscle);
      for (const item of exercise.equipment) expect(EQUIPMENT, label).toContain(item);
      expect(exercise.instructions.length, label).toBeGreaterThanOrEqual(2);
      for (const step of exercise.instructions) expect(step.trim().length, label).toBeGreaterThan(10);
    }
  });

  it("covers every muscle group with several exercises", () => {
    for (const muscle of MUSCLES) {
      const count = EXERCISES.filter((exercise) => exercise.primary.includes(muscle)).length;
      expect(count, muscle).toBeGreaterThanOrEqual(MIN_PRIMARY_PER_MUSCLE);
    }
  });

  it("offers a beginner-friendly option without gear for every main pattern", () => {
    for (const pattern of PATTERNS_NEEDED_WITHOUT_GEAR) {
      const options = EXERCISES.filter(
        (exercise) =>
          exercise.pattern === pattern &&
          exercise.difficulty !== "advanced" &&
          exercise.equipment.every((item) => MINIMAL_GEAR.includes(item)),
      );
      expect(options.length, pattern).toBeGreaterThanOrEqual(1);
    }
  });

  it("has a first-choice exercise for every strength pattern", () => {
    const strengthPatterns = MOVEMENT_PATTERNS.filter((pattern) => pattern !== "cardio");
    for (const pattern of strengthPatterns) {
      const staples = EXERCISES.filter(
        (exercise) => exercise.pattern === pattern && exercise.priority === 1,
      );
      expect(staples.length, pattern).toBeGreaterThanOrEqual(1);
    }
  });

  it("has typical mistakes and short cues for every exercise", () => {
    for (const exercise of EXERCISES) {
      const label = exercise.id;
      for (const list of [exercise.mistakes, exercise.cues]) {
        expect(list.length, label).toBeGreaterThanOrEqual(MIN_COACHING_ITEMS);
        expect(list.length, label).toBeLessThanOrEqual(MAX_COACHING_ITEMS);
        for (const item of list) {
          expect(item.trim(), label).toBe(item);
          expect(item.length, label).toBeGreaterThan(3);
        }
        expect(new Set(list.map((item) => item.toLowerCase())).size, label).toBe(list.length);
      }
      for (const mistake of exercise.mistakes) expect(mistake, label).toContain(" – ");
      for (const cue of exercise.cues) {
        expect(cue.split(/\s+/).length, `${label}: ${cue}`).toBeLessThanOrEqual(MAX_CUE_WORDS);
      }
    }
  });
});
