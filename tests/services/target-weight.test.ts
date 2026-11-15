import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EQUIPMENT } from "@/domain/exercises/types";
import { toLocalDate } from "@/lib/dates";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import type { OnboardingInput, RoutineInput } from "@/features/training/schemas";
import { createPlanFromProfile, getRoutine, swapPlanExercise } from "@/features/training/services/plan-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import {
  createFolder,
  createRoutine,
  listTargetWeightChanges,
  saveRoutine,
} from "@/features/training/services/routine-service";
import { deleteWorkout, finishWorkout, saveSet, startWorkout } from "@/features/training/services/workout-service";
import { getWorkoutView } from "@/features/training/services/workout-view";
import { collectUserData } from "@/features/users/services/data-export";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const NOW = new Date("2026-11-16T17:00:00Z");
const TODAY = toLocalDate(NOW);
const DAY_MS = 86_400_000;
const BENCH = "barbell-bench-press";
const PUSH_UP = "push-up";

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

const entry = (exerciseId: string, targetWeightKg?: number | null) => ({
  exerciseId,
  sets: 3,
  repMin: 8,
  repMax: 12,
  targetRir: 2,
  restSeconds: 90,
  groupId: null,
  ...(targetWeightKg === undefined ? {} : { targetWeightKg }),
});

let testDb: TestDatabase;
let userId: string;
let folderId: string;
let routineId: string;

function routine(exercises: RoutineInput["exercises"]): RoutineInput {
  return { name: "Push", weekday: 0, folderId, exercises };
}

/** Trainiert die Routine: alle Sätze der ersten Übung mit festen Werten, dann abschließen. */
async function train(at: Date, weightKg: number, reps: number) {
  const sessionId = await startWorkout(testDb.db, userId, routineId, at);
  const view = await getWorkoutView(testDb.db, userId, sessionId);
  const exercise = view.exercises[0];
  for (const [position, set] of exercise.sets.entries()) {
    await saveSet(
      testDb.db,
      userId,
      { id: set.id, workoutExerciseId: exercise.id, position, type: "work", weightKg, reps, rir: 2, note: null, completed: true },
      at,
    );
  }
  await finishWorkout(testDb.db, userId, sessionId, new Date(at.getTime() + 40 * 60_000));
}

async function firstTargets(at: Date) {
  const sessionId = await startWorkout(testDb.db, userId, routineId, at);
  const view = await getWorkoutView(testDb.db, userId, sessionId);
  return { sessionId, sets: view.exercises[0].sets };
}

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.reset();
  userId = (await createUserWithPassword(testDb.db, { username: "Eddi", password: TEST_PASSWORDS.eddi, role: "user" })).id;
  await saveOnboarding(testDb.db, userId, onboarding);
  await createPlanFromProfile(testDb.db, userId, TODAY, NOW);
  folderId = await createFolder(testDb.db, userId, "Eigener Plan", TODAY);
  routineId = await createRoutine(testDb.db, userId, folderId, "Push");
});

describe("target weight in routines", () => {
  it("stores the weight, uses it for the next workout and logs every change", async () => {
    // Liegestütze haben kein Zusatzgewicht: Ihre Angabe fällt weg.
    await saveRoutine(testDb.db, userId, routineId, routine([entry(BENCH, null), entry(PUSH_UP, 30)]), NOW);
    await train(new Date(NOW.getTime() + DAY_MS), 60, 12);
    // Ohne eigenes Gewicht steigert die App: 12 Wiederholungen → 62,5 kg.
    const automatic = await firstTargets(new Date(NOW.getTime() + 2 * DAY_MS));
    expect(automatic.sets[0]).toMatchObject({ targetWeightKg: 62.5, targetReps: 8 });
    await deleteWorkout(testDb.db, userId, automatic.sessionId);

    const changedAt = new Date(NOW.getTime() + 3 * DAY_MS);
    await saveRoutine(testDb.db, userId, routineId, routine([entry(BENCH, 50), entry(PUSH_UP, 30)]), changedAt);
    const stored = await getRoutine(testDb.db, userId, routineId);
    expect(stored.day.exercises.map((item) => item.targetWeightKg)).toEqual([50, null]);

    const planned = await firstTargets(new Date(changedAt.getTime() + DAY_MS));
    expect(planned.sets.map((set) => set.targetWeightKg)).toEqual([50, 50, 50]);
    expect(planned.sets[0].targetReps).toBe(8);

    // Kein Eintrag für Liegestütze (ohne Zusatzgewicht) und keiner für unverändertes Speichern.
    await saveRoutine(testDb.db, userId, routineId, routine([entry(BENCH, 50)]), changedAt);
    const changes = await listTargetWeightChanges(testDb.db, userId, BENCH);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ fromKg: null, toKg: 50, routineName: "Push", date: toLocalDate(changedAt) });
    expect(await listTargetWeightChanges(testDb.db, userId, PUSH_UP)).toEqual([]);
  });

  it("hands back to the progression once the exercise was trained with the new weight", async () => {
    await saveRoutine(testDb.db, userId, routineId, routine([entry(BENCH, 40)]), NOW);
    await train(new Date(NOW.getTime() + DAY_MS), 40, 12);
    const next = await firstTargets(new Date(NOW.getTime() + 3 * DAY_MS));
    expect(next.sets[0]).toMatchObject({ targetWeightKg: 42.5, targetReps: 8 });
  });

  it("keeps the weight when saved without it and drops it when the exercise is swapped", async () => {
    await saveRoutine(testDb.db, userId, routineId, routine([entry(BENCH, 70)]), NOW);
    // Ohne Angabe (z. B. „Plan verfeinern“) bleibt das Gewicht, ohne neuen Verlaufseintrag.
    await saveRoutine(testDb.db, userId, routineId, routine([entry(BENCH)]), NOW);
    const kept = await getRoutine(testDb.db, userId, routineId);
    expect(kept.day.exercises[0].targetWeightKg).toBe(70);
    expect(await listTargetWeightChanges(testDb.db, userId, BENCH)).toHaveLength(1);

    await swapPlanExercise(testDb.db, userId, kept.day.exercises[0].id, "dumbbell-bench-press");
    const swapped = await getRoutine(testDb.db, userId, routineId);
    expect(swapped.day.exercises[0]).toMatchObject({ targetWeightKg: null });
  });

  it("is part of the data export", async () => {
    await saveRoutine(testDb.db, userId, routineId, routine([entry(BENCH, 55)]), NOW);
    const data = await collectUserData(testDb.db, userId);
    expect(data.training.targetWeightChanges).toEqual([expect.objectContaining({ exerciseId: BENCH, toKg: 55 })]);
  });
});
