import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { trainingPlan, workoutSession } from "@/db/schema";
import { EQUIPMENT } from "@/domain/exercises/types";
import { toLocalDate } from "@/lib/dates";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import type { OnboardingInput } from "@/features/training/schemas";
import { getTrainingStats } from "@/features/training/services/history-service";
import { createPlanFromProfile, getActivePlan, getRoutine, swapPlanExercise } from "@/features/training/services/plan-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { getRecoveryDay } from "@/features/training/services/recovery-day-service";
import { createFolder, createRoutine, saveRoutine } from "@/features/training/services/routine-service";
import { getPreferences, getTrainingSettings, saveTrainingSettings } from "@/features/training/services/settings-service";
import { finishWorkout, saveSet, startFreeWorkout, startWorkout } from "@/features/training/services/workout-service";
import { getWorkoutView } from "@/features/training/services/workout-view";
import { plannedWeekdays } from "@/features/training/titles";
import { pauseDates } from "@/domain/training/vacation";
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
  sex: "female",
  birthYear: 1992,
  heightCm: 170,
  weightKg: 65,
  activityLevel: "light",
  injuries: [],
  injuryNote: "",
  excludedExerciseIds: [],
};

const routineExercise = (exerciseId: string, groupId: string | null = null) => ({
  exerciseId,
  sets: 3,
  repMin: 8,
  repMax: 12,
  targetRir: 2,
  restSeconds: 90,
  groupId,
});

let testDb: TestDatabase;
let annaId: string;
let eddiId: string;

/** Loggt alle Sätze der ersten Übung mit festen Werten und schließt das Training ab. */
async function completeFirstExercise(userId: string, sessionId: string, weightKg: number, reps: number, at: Date) {
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
  return exercise;
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

describe("time saver, re-entry and modes", () => {
  it("starts a shorter version of the day", async () => {
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const day = plan!.days[0];
    const view = await getWorkoutView(testDb.db, annaId, await startWorkout(testDb.db, annaId, day.id, NOW, { short: true }));
    expect(view.isShort).toBe(true);
    expect(view.exercises.length).toBeLessThanOrEqual(day.exercises.length);
    const plannedSets = day.exercises.reduce((total, entry) => total + entry.sets, 0);
    const shortSets = view.exercises.reduce((total, exercise) => total + exercise.sets.length, 0);
    expect(shortSets).toBeLessThan(plannedSets);
    expect(view.exercises[0].exerciseId).toBe(day.exercises[0].exercise.id);
  });

  it("starts lighter after a long break", async () => {
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const dayId = plan!.days[0].id;
    const first = await startWorkout(testDb.db, annaId, dayId, NOW);
    const done = await completeFirstExercise(annaId, first, 60, 8, NOW);

    const soon = await startWorkout(testDb.db, annaId, dayId, new Date(NOW.getTime() + 2 * 86_400_000));
    const normal = (await getWorkoutView(testDb.db, annaId, soon)).exercises.find((item) => item.exerciseId === done.exerciseId);
    expect(normal?.sets[0].targetWeightKg).toBe(60);
    await testDb.db.delete(workoutSession).where(eq(workoutSession.id, soon));

    const late = await startWorkout(testDb.db, annaId, dayId, new Date(NOW.getTime() + 30 * 86_400_000));
    const eased = (await getWorkoutView(testDb.db, annaId, late)).exercises.find((item) => item.exerciseId === done.exerciseId);
    expect(eased?.sets[0].targetWeightKg).toBeLessThan(60);
    expect(eased?.sets[0].targetWeightKg).toBeGreaterThanOrEqual(50);
  });

  it("stores and reads the adjustments", async () => {
    expect(await getTrainingSettings(testDb.db, annaId)).toMatchObject({ recoveryMode: false, gripModule: false, vacation: null, cycle: null });
    await saveTrainingSettings(testDb.db, annaId, { recoveryMode: true });
    await saveTrainingSettings(testDb.db, annaId, {
      gripModule: true,
      cycle: { enabled: true, lastStart: TODAY, lengthDays: 28 },
      extraSports: [{ type: "running", sessionsPerWeek: 3 }],
    });
    expect(await getTrainingSettings(testDb.db, annaId)).toMatchObject({
      recoveryMode: true,
      gripModule: true,
      cycle: { enabled: true, lengthDays: 28 },
      extraSports: [{ type: "running", sessionsPerWeek: 3 }],
    });
    expect((await getTrainingSettings(testDb.db, eddiId)).recoveryMode).toBe(false);
  });

  it("holds the weights and eases the target during menstruation when enabled", async () => {
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const dayId = plan!.days[0].id;
    const first = await startWorkout(testDb.db, annaId, dayId, NOW);
    const done = await completeFirstExercise(annaId, first, 60, 10, NOW);

    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    await saveTrainingSettings(testDb.db, annaId, { cycle: { enabled: true, lastStart: toLocalDate(later), lengthDays: 28 } });
    const view = await getWorkoutView(testDb.db, annaId, await startWorkout(testDb.db, annaId, dayId, later));
    const exercise = view.exercises.find((item) => item.exerciseId === done.exerciseId);
    // Ohne Zyklus gäbe es nach 10 Wiederholungen am oberen Ende mehr Gewicht.
    expect(exercise?.sets[0]).toMatchObject({ targetWeightKg: 60, targetReps: 10 });
    expect(exercise?.targetRir).toBe(done.targetRir + 1);
  });

  it("does not count pause days as missed", async () => {
    const monday = "2026-11-09";
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id, new Date(`${monday}T17:00:00Z`));
    await finishWorkout(testDb.db, annaId, sessionId, new Date(`${monday}T18:00:00Z`));
    const weekdays = plannedWeekdays(plan!.days);
    expect((await getTrainingStats(testDb.db, annaId, weekdays, "2026-11-15")).streak).toBe(0);
    const pause = pauseDates({ type: "pause", from: "2026-11-10", until: "2026-11-15", gymProfileId: null });
    expect((await getTrainingStats(testDb.db, annaId, weekdays, "2026-11-15", pause)).streak).toBe(1);
  });

  it("adds grip work to a new plan when the module is on", async () => {
    await saveTrainingSettings(testDb.db, annaId, { gripModule: true });
    await createPlanFromProfile(testDb.db, annaId, TODAY);
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const forearmDays = plan!.days.filter((day) => day.exercises.some((entry) => entry.exercise.primary.includes("forearms")));
    expect(forearmDays.length).toBeGreaterThanOrEqual(2);
  });
});

describe("learning generator", () => {
  it("remembers swapped and removed suggestions and counts usage", async () => {
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const day = plan!.days[0];
    const swapped = day.exercises[0];
    const removed = day.exercises[1];
    await swapPlanExercise(testDb.db, annaId, swapped.id, "dumbbell-bench-press");

    const routine = await getRoutine(testDb.db, annaId, day.id);
    await saveRoutine(testDb.db, annaId, day.id, {
      name: "",
      weekday: day.weekday ?? 0,
      folderId: routine.folder.id,
      exercises: routine.day.exercises
        .filter((entry) => entry.exercise.id !== removed.exercise.id)
        .map((entry) => routineExercise(entry.exercise.id)),
    });

    const sessionId = await startWorkout(testDb.db, annaId, day.id, NOW);
    const trained = await completeFirstExercise(annaId, sessionId, 20, 10, NOW);

    const preferences = await getPreferences(testDb.db, annaId, TODAY);
    expect(preferences.get(swapped.exercise.id)).toEqual({ usage: 0, rejections: 1 });
    expect(preferences.get(removed.exercise.id)).toEqual({ usage: 0, rejections: 1 });
    expect(preferences.get(trained.exerciseId)?.usage).toBe(1);
    expect((await getPreferences(testDb.db, eddiId, TODAY)).size).toBe(0);
  });

  it("does not learn from edits of an own plan", async () => {
    const folder = await createFolder(testDb.db, annaId, "Mein Plan", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Push");
    await saveRoutine(testDb.db, annaId, routine, { name: "Push", weekday: 0, folderId: folder, exercises: [routineExercise("push-up")] });
    await saveRoutine(testDb.db, annaId, routine, { name: "Push", weekday: 0, folderId: folder, exercises: [] });
    expect((await getPreferences(testDb.db, annaId, TODAY)).get("push-up")).toBeUndefined();
  });

  it("leaves a rejected suggestion out of the next generated plan", async () => {
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const first = plan!.days[0].exercises[0];
    const options = plan!.days[0].exercises.map((entry) => entry.exercise.id);
    await swapPlanExercise(testDb.db, annaId, first.id, "dumbbell-bench-press");
    expect(options).toContain(first.exercise.id);
    await swapPlanExercise(testDb.db, annaId, first.id, first.exercise.id);
    await swapPlanExercise(testDb.db, annaId, first.id, "dumbbell-bench-press");
    await createPlanFromProfile(testDb.db, annaId, TODAY);
    const next = await getActivePlan(testDb.db, annaId, TODAY);
    expect(next!.days.flatMap((day) => day.exercises.map((entry) => entry.exercise.id))).not.toContain(first.exercise.id);
    const archived = await testDb.db.select().from(trainingPlan).where(eq(trainingPlan.userId, annaId));
    expect(archived.filter((row) => row.status === "archived")).toHaveLength(1);
  });
});

describe("recovery-oriented mode", () => {
  it("suggests a day and starts it as a free workout", async () => {
    expect(await getRecoveryDay(testDb.db, eddiId, NOW)).toBeNull();
    const day = await getRecoveryDay(testDb.db, annaId, NOW);
    expect(day?.restRecommended).toBe(false);
    expect(day!.exercises.length).toBeGreaterThanOrEqual(3);

    const sessionId = await startFreeWorkout(testDb.db, annaId, "Training nach Erholung", day!.exercises, NOW);
    const view = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(view).toMatchObject({ name: "Training nach Erholung", focus: null, isDeload: false });
    expect(view.exercises.map((exercise) => exercise.exerciseId)).toEqual(day!.exercises.map((entry) => entry.exerciseId));
  });

  it("avoids the muscles trained hard today", async () => {
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id, NOW);
    const view = await getWorkoutView(testDb.db, annaId, sessionId);
    for (const exercise of view.exercises) {
      for (const [position, set] of exercise.sets.entries()) {
        await saveSet(testDb.db, annaId, { id: set.id, workoutExerciseId: exercise.id, position, type: "work", weightKg: 40, reps: 10, rir: 0, note: null, completed: true }, NOW);
      }
    }
    await finishWorkout(testDb.db, annaId, sessionId, new Date(NOW.getTime() + 60 * 60_000));
    const trained = new Set(view.exercises.map((exercise) => exercise.exerciseId));
    const next = await getRecoveryDay(testDb.db, annaId, new Date(NOW.getTime() + 2 * 60 * 60_000));
    const repeated = next!.exercises.filter((entry) => trained.has(entry.exerciseId));
    expect(repeated.length).toBeLessThan(next!.exercises.length);
  });
});
