import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { EQUIPMENT } from "@/domain/exercises/types";
import type { SyncOperation } from "@/domain/sync/operations";
import type { ExerciseFeedback } from "@/domain/training/types";
import { setAiConsent } from "@/features/ai/services/ai-service";
import { suggestPlanChanges } from "@/features/ai/services/plan-refinement";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import { processOperations } from "@/features/sync/services/sync-service";
import type { OnboardingInput } from "@/features/training/schemas";
import { createPlanFromProfile, getActivePlan } from "@/features/training/services/plan-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { getTrainingSettings, saveTrainingSettings } from "@/features/training/services/settings-service";
import { getPreviousPerformances } from "@/features/training/services/workout-queries";
import { finishWorkout, saveSet, startWorkout } from "@/features/training/services/workout-service";
import { getWorkoutView, type WorkoutView } from "@/features/training/services/workout-view";
import { addDays, toLocalDate } from "@/lib/dates";
import type { LlmProvider, LlmRequest } from "@/lib/llm";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const NOW = new Date("2026-11-16T17:00:00Z");
const TODAY = toLocalDate(NOW);

const onboarding: OnboardingInput = {
  goal: "muscle_gain",
  experience: "intermediate",
  weekdays: [1, 3, 5],
  sessionMinutes: 60,
  locationType: "gym",
  equipment: [...EQUIPMENT],
  cardio: { wanted: false, types: [], sessionsPerWeek: 0 },
  sex: "male",
  birthYear: 1990,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "light",
  injuries: [],
  injuryNote: "",
  excludedExerciseIds: [],
};

let testDb: TestDatabase;
let annaId: string;
let eddiId: string;
let opCounter = 0;

function feedbackOp(workoutExerciseId: string, feedback: ExerciseFeedback): SyncOperation {
  return {
    id: `00000000-0000-4000-8000-${String(++opCounter).padStart(12, "0")}`,
    at: NOW.toISOString(),
    type: "exercise.feedback",
    payload: { workoutExerciseId, ...feedback },
  };
}

/** Startet den ersten Plantag am angegebenen Tag und hakt alle Sätze der ersten Übung ab. */
async function trainFirstExercise(at: Date, setRir: number | null = null): Promise<WorkoutView> {
  const plan = await getActivePlan(testDb.db, annaId, toLocalDate(at));
  const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id, at);
  const view = await getWorkoutView(testDb.db, annaId, sessionId);
  const exercise = view.exercises[0];
  for (const [position, set] of exercise.sets.entries()) {
    await saveSet(
      testDb.db,
      annaId,
      { id: set.id, workoutExerciseId: exercise.id, position, type: "work", weightKg: 60, reps: 8, rir: setRir, note: null, completed: true },
      at,
    );
  }
  return view;
}

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.reset();
  const { db } = testDb;
  annaId = (await createUserWithPassword(db, { username: "Anna", password: TEST_PASSWORDS.anna, role: "user" })).id;
  eddiId = (await createUserWithPassword(db, { username: "Eddi", password: TEST_PASSWORDS.eddi, role: "user" })).id;
  await saveOnboarding(db, annaId, onboarding);
  await createPlanFromProfile(db, annaId, TODAY, NOW);
});

describe("exercise check-in", () => {
  it("is switched on by default and can be switched off", async () => {
    expect((await getTrainingSettings(testDb.db, annaId)).exerciseCheckIn).toBe(true);
    await saveTrainingSettings(testDb.db, annaId, { exerciseCheckIn: false });
    expect((await getTrainingSettings(testDb.db, annaId)).exerciseCheckIn).toBe(false);
  });

  it("saves the answer over the offline queue, also afterwards, and can clear it", async () => {
    const view = await trainFirstExercise(NOW);
    const exerciseId = view.exercises[0].id;
    const results = await processOperations(testDb.db, annaId, [feedbackOp(exerciseId, { effort: "hard", rir: 1 })], NOW);
    expect(results[0].status).toBe("ok");
    expect((await getWorkoutView(testDb.db, annaId, view.id)).exercises[0].feedback).toEqual({ effort: "hard", rir: 1 });

    await finishWorkout(testDb.db, annaId, view.id, NOW);
    await processOperations(testDb.db, annaId, [feedbackOp(exerciseId, { effort: null, rir: null })], NOW);
    expect((await getWorkoutView(testDb.db, annaId, view.id)).exercises[0].feedback).toBeNull();
  });

  it("rejects answers for the workout of another user", async () => {
    const view = await trainFirstExercise(NOW);
    const results = await processOperations(testDb.db, eddiId, [feedbackOp(view.exercises[0].id, { effort: "easy", rir: 4 })], NOW);
    expect(results[0].status).toBe("rejected");
    expect((await getWorkoutView(testDb.db, annaId, view.id)).exercises[0].feedback).toBeNull();
  });

  it("uses the RIR of the answer for the last set when the sets have none", async () => {
    const view = await trainFirstExercise(NOW);
    const { id: workoutExerciseId, exerciseId } = view.exercises[0];
    await processOperations(testDb.db, annaId, [feedbackOp(workoutExerciseId, { effort: "easy", rir: 4 })], NOW);
    await finishWorkout(testDb.db, annaId, view.id, NOW);

    const previous = (await getPreviousPerformances(testDb.db, annaId, [exerciseId])).get(exerciseId);
    const rirs = previous?.sets.map((set) => set.rir) ?? [];
    expect(rirs.at(-1)).toBe(4);
    expect(rirs.slice(0, -1).every((rir) => rir === null)).toBe(true);
  });

  it("keeps the RIR logged for the set", async () => {
    const view = await trainFirstExercise(NOW, 1);
    const { id: workoutExerciseId, exerciseId } = view.exercises[0];
    await processOperations(testDb.db, annaId, [feedbackOp(workoutExerciseId, { effort: "easy", rir: 4 })], NOW);
    await finishWorkout(testDb.db, annaId, view.id, NOW);
    const previous = (await getPreviousPerformances(testDb.db, annaId, [exerciseId])).get(exerciseId);
    expect(previous?.sets.every((set) => set.rir === 1)).toBe(true);
  });
});

describe("check-in answers in the AI plan refinement", () => {
  it("sends recent answers of finished workouts, but no older ones", async () => {
    const old = new Date(`${addDays(TODAY, -40)}T17:00:00Z`);
    const oldView = await trainFirstExercise(old);
    await processOperations(testDb.db, annaId, [feedbackOp(oldView.exercises[0].id, { effort: "easy", rir: 3 })], NOW);
    await finishWorkout(testDb.db, annaId, oldView.id, old);

    const view = await trainFirstExercise(NOW);
    await processOperations(testDb.db, annaId, [feedbackOp(view.exercises[0].id, { effort: "max", rir: 0 })], NOW);
    await finishWorkout(testDb.db, annaId, view.id, NOW);

    await setAiConsent(testDb.db, annaId, true);
    const calls: LlmRequest<z.ZodType>[] = [];
    const provider: LlmProvider = {
      name: "Testanbieter",
      model: "test-model",
      generate: async (request) => {
        calls.push(request);
        return { status: "ok", data: request.schema.parse({ summary: "", changes: [] }), model: "test-model" } as never;
      },
    };
    await suggestPlanChanges(testDb.db, provider, annaId, "Passt das so?", TODAY);
    const prompt = calls[0].prompt;
    expect(prompt).toContain(`${view.exercises[0].exerciseId} | ${view.exercises[0].name}: ${TODAY} am Limit, RIR 0`);
    expect(prompt).not.toContain("leicht, RIR 3");
    // Gewichte und Wiederholungen aus dem Verlauf werden nicht gesendet.
    expect(prompt).not.toContain("60 kg");
  });
});
