import { describe, expect, it } from "vitest";
import { MIN_RANGE_WIDTH, normalizeBodyFatEstimate } from "@/domain/ai/body-fat";
import {
  MAX_PLAN_CHANGES,
  applyPlanChanges,
  validatePlanChanges,
  type CandidateExercise,
  type PlanDaySnapshot,
  type PlanExerciseSnapshot,
  type RawPlanChange,
} from "@/domain/ai/plan-changes";

const exercise = (exerciseId: string, overrides: Partial<PlanExerciseSnapshot> = {}): PlanExerciseSnapshot => ({
  exerciseId,
  name: exerciseId.toUpperCase(),
  type: "weight_reps",
  sets: 3,
  repMin: 6,
  repMax: 10,
  targetRir: 2,
  restSeconds: 150,
  groupId: null,
  ...overrides,
});

const day = (): PlanDaySnapshot => ({
  id: "d1",
  title: "Oberkörper A",
  exercises: [exercise("bench"), exercise("row"), exercise("curl", { groupId: "g" }), exercise("plank", { type: "duration", repMin: 30, repMax: 60 })],
});

const candidates = new Map<string, CandidateExercise>(
  (["bench", "row", "curl", "press", "fly", "raise"] as const)
    .map((id): [string, CandidateExercise] => [id, { id, name: id.toUpperCase(), type: "weight_reps" }])
    .concat([["hold", { id: "hold", name: "HOLD", type: "duration" }]]),
);

const change = (overrides: Partial<RawPlanChange>): RawPlanChange => ({
  dayId: "d1",
  action: "adjust",
  exerciseId: "bench",
  newExerciseId: null,
  sets: null,
  repMin: null,
  repMax: null,
  reason: "weil",
  ...overrides,
});

describe("validating AI plan changes", () => {
  it("accepts a replacement from the allowed list and keeps the prescription", () => {
    const [valid] = validatePlanChanges([day()], [change({ action: "replace", newExerciseId: "press" })], candidates);
    expect(valid).toMatchObject({ exerciseName: "BENCH", newExerciseName: "PRESS", dayTitle: "Oberkörper A", sets: 3, repMin: 6, repMax: 10 });
  });

  it("rejects exercises the model made up or that are not allowed", () => {
    const raw = [
      change({ action: "replace", newExerciseId: "erfunden" }),
      change({ action: "add", exerciseId: "erfunden" }),
      change({ action: "replace", exerciseId: "nicht-im-plan", newExerciseId: "press" }),
      change({ dayId: "fremd", action: "remove" }),
    ];
    expect(validatePlanChanges([day()], raw, candidates)).toEqual([]);
  });

  it("rejects duplicates within a day", () => {
    const raw = [
      change({ action: "replace", newExerciseId: "row" }),
      change({ action: "add", exerciseId: "curl" }),
      change({ action: "add", exerciseId: "press" }),
      change({ action: "replace", exerciseId: "row", newExerciseId: "press" }),
    ];
    const valid = validatePlanChanges([day()], raw, candidates);
    expect(valid.map((item) => `${item.action}:${item.exerciseId}`)).toEqual(["add:press"]);
  });

  it("checks sets and repetitions", () => {
    const ok = validatePlanChanges([day()], [change({ sets: 4, repMin: 8, repMax: 12 })], candidates);
    expect(ok[0]).toMatchObject({ sets: 4, repMin: 8, repMax: 12 });
    const bad = [
      change({ sets: 0 }),
      change({ sets: 99 }),
      change({ sets: 2.5 }),
      change({ repMin: 12, repMax: 8 }),
      change({ repMax: 500 }),
      change({}),
      change({ sets: 3, repMin: 6, repMax: 10 }),
    ];
    for (const item of bad) expect(validatePlanChanges([day()], [item], candidates)).toEqual([]);
  });

  it("allows seconds for timed exercises and switches defaults when the kind changes", () => {
    const timed = validatePlanChanges([day()], [change({ exerciseId: "plank", repMin: 45, repMax: 90 })], candidates);
    expect(timed[0]).toMatchObject({ repMin: 45, repMax: 90 });
    const swapped = validatePlanChanges([day()], [change({ action: "replace", exerciseId: "curl", newExerciseId: "hold" })], candidates);
    expect(swapped[0]).toMatchObject({ repMin: 30, repMax: 60, sets: 3 });
  });

  it("never empties a day and caps the number of changes", () => {
    const small: PlanDaySnapshot = { id: "d1", title: "Kurz", exercises: [exercise("bench"), exercise("row")] };
    expect(validatePlanChanges([small], [change({ action: "remove" })], candidates)).toEqual([]);
    const many = Array.from({ length: 30 }, (_, index) => change({ sets: 4 + (index % 2), exerciseId: index % 2 ? "bench" : "row" }));
    expect(validatePlanChanges([day()], many, candidates).length).toBeLessThanOrEqual(MAX_PLAN_CHANGES);
  });

  it("only accepts one change per exercise and trims the reason", () => {
    const raw = [change({ sets: 4, reason: ` ${"x".repeat(900)} ` }), change({ sets: 5 }), change({ action: "remove" })];
    const valid = validatePlanChanges([day()], raw, candidates);
    expect(valid).toHaveLength(1);
    expect(valid[0].sets).toBe(4);
    expect(valid[0].reason.length).toBeLessThanOrEqual(300);
  });
});

describe("applying AI plan changes", () => {
  it("replaces in place, adjusts, removes and appends", () => {
    const raw = [
      change({ action: "replace", newExerciseId: "press", sets: 4 }),
      change({ exerciseId: "row", repMin: 8, repMax: 12 }),
      change({ action: "remove", exerciseId: "plank" }),
      change({ action: "add", exerciseId: "raise", sets: 2, repMin: 12, repMax: 15 }),
    ];
    const valid = validatePlanChanges([day()], raw, candidates);
    expect(valid).toHaveLength(4);
    const result = applyPlanChanges(day(), valid, candidates);
    expect(result.map((item) => item.exerciseId)).toEqual(["press", "row", "curl", "raise"]);
    expect(result[0]).toMatchObject({ sets: 4, repMin: 6, repMax: 10, restSeconds: 150 });
    expect(result[1]).toMatchObject({ sets: 3, repMin: 8, repMax: 12 });
    // Supersatz-Zuordnung und Pausen unveränderter Übungen bleiben erhalten.
    expect(result[2]).toMatchObject({ groupId: "g", restSeconds: 150 });
    expect(result[3]).toMatchObject({ sets: 2, repMin: 12, repMax: 15, groupId: null });
  });

  it("ignores changes of other days", () => {
    const other = validatePlanChanges([{ ...day(), id: "d2" }], [change({ dayId: "d2", sets: 5 })], candidates);
    expect(applyPlanChanges(day(), other, candidates)).toEqual(day().exercises);
  });
});

describe("body fat estimate", () => {
  it("accepts a plausible range", () => {
    expect(normalizeBodyFatEstimate({ canEstimate: true, lowPercent: 17.6, highPercent: 22.2, note: " Gut erkennbar. " })).toEqual({
      lowPercent: 18,
      highPercent: 22,
      note: "Gut erkennbar.",
    });
  });

  it("swaps reversed bounds and widens a range that pretends to be precise", () => {
    expect(normalizeBodyFatEstimate({ canEstimate: true, lowPercent: 24, highPercent: 19, note: "" })).toMatchObject({ lowPercent: 19, highPercent: 24 });
    const narrow = normalizeBodyFatEstimate({ canEstimate: true, lowPercent: 20, highPercent: 20, note: "" });
    expect(narrow!.highPercent - narrow!.lowPercent).toBeGreaterThanOrEqual(MIN_RANGE_WIDTH);
    expect(narrow!.lowPercent).toBeLessThanOrEqual(20);
    expect(narrow!.highPercent).toBeGreaterThanOrEqual(20);
  });

  it("rejects refusals, missing values and implausible numbers", () => {
    expect(normalizeBodyFatEstimate({ canEstimate: false, lowPercent: 18, highPercent: 22, note: "zu dunkel" })).toBeNull();
    expect(normalizeBodyFatEstimate({ canEstimate: true, lowPercent: null, highPercent: 22, note: "" })).toBeNull();
    expect(normalizeBodyFatEstimate({ canEstimate: true, lowPercent: 1, highPercent: 4, note: "" })).toBeNull();
    expect(normalizeBodyFatEstimate({ canEstimate: true, lowPercent: 40, highPercent: 75, note: "" })).toBeNull();
    expect(normalizeBodyFatEstimate({ canEstimate: true, lowPercent: 10, highPercent: 40, note: "" })).toBeNull();
    expect(normalizeBodyFatEstimate({ canEstimate: true, lowPercent: Number.NaN, highPercent: 20, note: "" })).toBeNull();
  });
});
