import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { trainingPlan, workoutExercise, workoutSession } from "@/db/schema";
import { EQUIPMENT } from "@/domain/exercises/types";
import { AppError } from "@/lib/errors";
import { addDays, toLocalDate } from "@/lib/dates";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import type { GymInput, OnboardingInput, RoutineInput } from "@/features/training/schemas";
import { createGym, deleteGym, listGyms } from "@/features/training/services/gym-service";
import {
  createPlanFromProfile,
  getActivePlan,
  getScheduledPlans,
  getSwapOptions,
  listFolders,
} from "@/features/training/services/plan-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import {
  createFolder,
  createRoutine,
  deleteFolder,
  saveRoutine,
  setPlanGym,
  setPlanStatus,
} from "@/features/training/services/routine-service";
import { finishWorkout, startWorkout } from "@/features/training/services/workout-service";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

// 2026-11-16 ist ein Montag.
const NOW = new Date("2026-11-16T07:00:00Z");
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

const park: GymInput = {
  name: "Park",
  type: "travel",
  equipment: ["pull_up_bar"],
  plateUnit: null,
  barWeight: null,
  plates: null,
  weightRules: [],
};

const routine = (folderId: string, weekday: number, exerciseIds: string[]): RoutineInput => ({
  name: "Draußen",
  weekday,
  folderId,
  exercises: exerciseIds.map((exerciseId) => ({
    exerciseId,
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSeconds: 90,
    groupId: null,
  })),
});

let testDb: TestDatabase;
let annaId: string;
let eddiId: string;
let mainId: string;

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

/** Legt einen Plan mit einer Routine an und gibt Plan- und Routinen-Kennung zurück. */
async function planWithRoutine(name: string, weekday: number, exerciseIds: string[]) {
  const folderId = await createFolder(testDb.db, annaId, name, TODAY, NOW);
  const dayId = await createRoutine(testDb.db, annaId, folderId, name);
  await saveRoutine(testDb.db, annaId, dayId, routine(folderId, weekday, exerciseIds));
  return { folderId, dayId };
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
  mainId = await createPlanFromProfile(db, annaId, TODAY, NOW);
});

describe("plan roles", () => {
  it("schedules main and extra plans, main plan first", async () => {
    const outdoor = await planWithRoutine("Draußen", 1, ["pull-up"]);
    const winter = await planWithRoutine("Winter", 2, ["push-up"]);
    await setPlanStatus(testDb.db, annaId, outdoor.folderId, "extra", NOW);

    const scheduled = await getScheduledPlans(testDb.db, annaId, TODAY);
    expect(scheduled.map((plan) => [plan.id, plan.status])).toEqual([
      [mainId, "active"],
      [outdoor.folderId, "extra"],
    ]);
    expect(scheduled.some((plan) => plan.id === winter.folderId)).toBe(false);
  });

  it("starts an extra plan on the day it is scheduled", async () => {
    const outdoor = await planWithRoutine("Draußen", 1, ["pull-up"]);
    const later = new Date(NOW.getTime() + 3 * 86_400_000);
    await setPlanStatus(testDb.db, annaId, outdoor.folderId, "extra", later);
    const plan = (await getScheduledPlans(testDb.db, annaId, TODAY)).find((item) => item.id === outdoor.folderId);
    expect(plan?.startDate).toBe(addDays(TODAY, 3));
  });

  it("keeps the old main plan as inactive plan when another becomes main", async () => {
    const outdoor = await planWithRoutine("Draußen", 1, ["pull-up"]);
    await setPlanStatus(testDb.db, annaId, outdoor.folderId, "active", NOW);
    const folders = await listFolders(testDb.db, annaId);
    expect(folders.map((plan) => [plan.id, plan.status])).toEqual([
      [outdoor.folderId, "active"],
      [mainId, "saved"],
    ]);
  });

  it("refuses to archive or demote the main plan", async () => {
    await expectAppError(setPlanStatus(testDb.db, annaId, mainId, "archived"), "PLAN_ACTIVE");
    await expectAppError(setPlanStatus(testDb.db, annaId, mainId, "extra"), "PLAN_ACTIVE");
  });

  it("archives, restores and finally deletes a plan", async () => {
    const winter = await planWithRoutine("Winter", 2, ["push-up"]);
    await setPlanStatus(testDb.db, annaId, winter.folderId, "archived", NOW);
    expect((await listFolders(testDb.db, annaId)).some((plan) => plan.id === winter.folderId)).toBe(false);
    expect((await listFolders(testDb.db, annaId, { archived: true })).map((plan) => plan.id)).toEqual([
      winter.folderId,
    ]);

    await setPlanStatus(testDb.db, annaId, winter.folderId, "saved", NOW);
    expect((await listFolders(testDb.db, annaId)).find((plan) => plan.id === winter.folderId)?.status).toBe("saved");

    await setPlanStatus(testDb.db, annaId, winter.folderId, "archived", NOW);
    await deleteFolder(testDb.db, annaId, winter.folderId);
    expect(await listFolders(testDb.db, annaId, { archived: true })).toEqual([]);
  });

  it("archives a replaced generated plan so that it can be restored", async () => {
    await createPlanFromProfile(testDb.db, annaId, TODAY, NOW);
    const archived = await listFolders(testDb.db, annaId, { archived: true });
    expect(archived.map((plan) => plan.id)).toEqual([mainId]);
  });

  it("rejects changing plans of other users", async () => {
    await expectAppError(setPlanStatus(testDb.db, eddiId, mainId, "extra"), "NOT_FOUND");
    await expectAppError(setPlanGym(testDb.db, eddiId, mainId, null), "NOT_FOUND");
  });
});

describe("fixed location per plan", () => {
  it("creates generated plans without a fixed location", async () => {
    expect((await getActivePlan(testDb.db, annaId, TODAY))?.gymProfileId).toBeNull();
  });

  it("trains a plan with a fixed location there, regardless of today's location", async () => {
    const parkId = await createGym(testDb.db, annaId, park);
    expect((await listGyms(testDb.db, annaId)).find((gym) => gym.id === parkId)?.isActive).toBe(false);
    const outdoor = await planWithRoutine("Draußen", 1, ["pull-up", "barbell-bench-press"]);

    // Ohne festen Ort gilt das Studio: Bankdrücken bleibt.
    const before = await getScheduledPlans(testDb.db, annaId, TODAY);
    expect(before).toHaveLength(1);

    await setPlanGym(testDb.db, annaId, outdoor.folderId, parkId);
    await setPlanStatus(testDb.db, annaId, outdoor.folderId, "extra", NOW);
    const plan = (await getScheduledPlans(testDb.db, annaId, TODAY)).find((item) => item.id === outdoor.folderId);
    expect(plan?.gymProfileId).toBe(parkId);
    const planned = plan?.days[0]?.exercises.map((entry) => entry.exercise.id) ?? [];
    expect(planned).toContain("pull-up");
    expect(planned).not.toContain("barbell-bench-press");

    const sessionId = await startWorkout(testDb.db, annaId, outdoor.dayId, NOW);
    const session = await testDb.db.query.workoutSession.findFirst({ where: eq(workoutSession.id, sessionId) });
    expect(session?.gymProfileId).toBe(parkId);
    const trained = await testDb.db.query.workoutExercise.findMany({
      where: eq(workoutExercise.sessionId, sessionId),
    });
    expect(trained.map((row) => row.exerciseId)).not.toContain("barbell-bench-press");
  });

  it("offers swap options that fit the plan's location", async () => {
    const parkId = await createGym(testDb.db, annaId, park);
    const outdoor = await planWithRoutine("Draußen", 1, ["pull-up"]);
    await setPlanGym(testDb.db, annaId, outdoor.folderId, parkId);
    const [plan] = await listFolders(testDb.db, annaId).then((folders) =>
      folders.filter((item) => item.id === outdoor.folderId),
    );
    const planExerciseId = plan?.days[0]?.exercises[0]?.id ?? "";
    const options = await getSwapOptions(testDb.db, annaId, planExerciseId, TODAY);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((exercise) => exercise.equipment.every((item) => item === "pull_up_bar"))).toBe(true);
  });

  it("falls back to today's location when the fixed location is deleted", async () => {
    const parkId = await createGym(testDb.db, annaId, park);
    const outdoor = await planWithRoutine("Draußen", 1, ["barbell-bench-press"]);
    await setPlanGym(testDb.db, annaId, outdoor.folderId, parkId);
    await deleteGym(testDb.db, annaId, parkId);
    const row = await testDb.db.query.trainingPlan.findFirst({ where: eq(trainingPlan.id, outdoor.folderId) });
    expect(row?.gymProfileId).toBeNull();
  });

  it("rejects locations of other users", async () => {
    const foreign = await createGym(testDb.db, eddiId, park);
    await expectAppError(setPlanGym(testDb.db, annaId, mainId, foreign), "NOT_FOUND");
  });

  it("lets a morning and an evening unit run on the same day", async () => {
    const outdoor = await planWithRoutine("Draußen", 1, ["pull-up"]);
    await setPlanStatus(testDb.db, annaId, outdoor.folderId, "extra", NOW);
    const morning = await startWorkout(testDb.db, annaId, outdoor.dayId, NOW);
    await finishWorkout(testDb.db, annaId, morning, new Date(NOW.getTime() + 30 * 60_000));
    const mainDay = (await getActivePlan(testDb.db, annaId, TODAY))?.days.find((day) => day.weekday === 1);
    const evening = await startWorkout(testDb.db, annaId, mainDay?.id ?? "", new Date(NOW.getTime() + 10 * 3_600_000));
    expect(evening).not.toBe(morning);
  });
});
