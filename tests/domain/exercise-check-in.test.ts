import { describe, expect, it } from "vitest";
import { summarizeFeedback, type FeedbackEntry } from "@/domain/ai/feedback-summary";
import { queueKey, syncOperationSchema } from "@/domain/sync/operations";
import { withExerciseRir } from "@/domain/training/progression";
import {
  applyPendingChanges,
  isExerciseDone,
  workoutReducer,
  type ExerciseDraft,
  type SetDraft,
} from "@/features/training/components/workout/workout-state";

const set = (overrides: Partial<SetDraft> = {}): SetDraft => ({
  id: "11111111-1111-4111-8111-111111111111",
  type: "work",
  weightText: "",
  repsText: "",
  rir: null,
  note: "",
  completed: false,
  ...overrides,
});

const exercise = (sets: SetDraft[]): ExerciseDraft => ({
  id: "we-1",
  exerciseId: "barbell-bench-press",
  name: "Bankdrücken",
  type: "weight_reps",
  repMin: 6,
  repMax: 10,
  targetRir: 2,
  restSeconds: 150,
  groupId: null,
  unit: "kg",
  incrementKg: 2.5,
  bar: null,
  note: "",
  previous: null,
  bests: null,
  feedback: null,
  sets,
});

describe("exercise check-in in the workout", () => {
  it("asks only when every work set is done", () => {
    expect(isExerciseDone(exercise([]))).toBe(false);
    expect(isExerciseDone(exercise([set({ completed: true }), set({ id: "b" })]))).toBe(false);
    // Offene Aufwärmsätze zählen nicht.
    expect(isExerciseDone(exercise([set({ id: "w", type: "warmup" }), set({ completed: true })]))).toBe(true);
  });

  it("stores the answer and treats two empty answers as none", () => {
    const state = [exercise([set({ completed: true })])];
    const rated = workoutReducer(state, { type: "feedback", exerciseId: "we-1", feedback: { effort: "hard", rir: 1 } });
    expect(rated[0].feedback).toEqual({ effort: "hard", rir: 1 });
    const cleared = workoutReducer(rated, { type: "feedback", exerciseId: "we-1", feedback: { effort: null, rir: null } });
    expect(cleared[0].feedback).toBeNull();
  });

  it("restores an answer that is still waiting in the offline queue", () => {
    const [result] = applyPendingChanges([exercise([set()])], {
      saves: [],
      deletedSetIds: [],
      feedback: [
        { workoutExerciseId: "we-2", effort: "easy", rir: 4 },
        { workoutExerciseId: "we-1", effort: "max", rir: 0 },
      ],
    });
    expect(result.feedback).toEqual({ effort: "max", rir: 0 });
  });

  it("is a valid offline operation that replaces older answers in the queue", () => {
    const operation = syncOperationSchema.parse({
      id: "22222222-2222-4222-8222-222222222222",
      at: "2026-11-16T17:00:00.000Z",
      type: "exercise.feedback",
      payload: { workoutExerciseId: "we-1", effort: "right", rir: 2 },
    });
    expect(queueKey(operation)).toBe("feedback:we-1");
    const invalid = { ...operation, payload: { workoutExerciseId: "we-1", effort: "brutal", rir: 9 } };
    expect(syncOperationSchema.safeParse(invalid).success).toBe(false);
  });
});

describe("exercise RIR in the progression", () => {
  const sets = [
    { weightKg: 60, reps: 8, rir: null },
    { weightKg: 60, reps: 8, rir: null },
  ];

  it("fills only the last set", () => {
    expect(withExerciseRir(sets, 3).map((item) => item.rir)).toEqual([null, 3]);
  });

  it("never overrides a RIR logged for the set", () => {
    const logged = [sets[0], { ...sets[1], rir: 1 }];
    expect(withExerciseRir(logged, 4)).toEqual(logged);
    expect(withExerciseRir(sets, null)).toEqual(sets);
    expect(withExerciseRir([], 2)).toEqual([]);
  });
});

describe("feedback summary for the AI", () => {
  const entry = (overrides: Partial<FeedbackEntry>): FeedbackEntry => ({
    exerciseId: "barbell-bench-press",
    name: "Bankdrücken (Langhantel)",
    date: "2026-11-10",
    effort: null,
    rir: null,
    ...overrides,
  });

  it("writes one line per exercise, newest first", () => {
    const lines = summarizeFeedback([
      entry({ date: "2026-11-03", effort: "right", rir: 2 }),
      entry({ date: "2026-11-10", effort: "max", rir: 0 }),
      entry({ exerciseId: "dumbbell-curl", name: "Bizepscurls (Kurzhantel)", date: "2026-11-12", rir: 4 }),
      entry({ exerciseId: "plank", name: "Plank", date: "2026-11-12" }),
    ]);
    expect(lines).toEqual([
      "dumbbell-curl | Bizepscurls (Kurzhantel): 2026-11-12 RIR 4+",
      "barbell-bench-press | Bankdrücken (Langhantel): 2026-11-10 am Limit, RIR 0; 2026-11-03 passend, RIR 2",
    ]);
  });

  it("keeps the summary short", () => {
    const many = Array.from({ length: 10 }, (_, index) => entry({ date: `2026-11-${String(index + 1).padStart(2, "0")}`, effort: "easy" }));
    expect(summarizeFeedback(many)[0].split(";")).toHaveLength(4);
  });
});
