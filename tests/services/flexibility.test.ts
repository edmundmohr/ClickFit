import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { workoutSession } from "@/db/schema";
import { EQUIPMENT, type Equipment } from "@/domain/exercises/types";
import { dayStatus } from "@/domain/training/calendar";
import { avoidedPatterns, isExerciseAvailable } from "@/domain/training/plan-generator";
import { detectRecords } from "@/domain/training/records";
import { toKg } from "@/domain/training/weights";
import { AppError } from "@/lib/errors";
import { addDays, toLocalDate } from "@/lib/dates";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import type { CustomExerciseInput, GymInput, OnboardingInput, RoutineInput } from "@/features/training/schemas";
import { getTrainingContext } from "@/features/training/services/context-service";
import { archiveCustomExercise, createCustomExercise, getUserCatalog, updateCustomExercise } from "@/features/training/services/exercise-service";
import { createGym, deleteGym, getGym, listGyms, setActiveGym, updateGym } from "@/features/training/services/gym-service";
import { createPlanFromProfile, getActivePlan, getRoutine, listFolders } from "@/features/training/services/plan-service";
import { listCompletedSessions } from "@/features/training/services/history-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { activateFolder, createFolder, createRoutine, deleteFolder, deleteRoutine, duplicateRoutine, renameFolder, saveRoutine } from "@/features/training/services/routine-service";
import { saveInjuries, saveTrainingSettings, setExerciseExcluded } from "@/features/training/services/settings-service";
import { finishWorkout, saveSet, startWorkout } from "@/features/training/services/workout-service";
import { getWorkoutView } from "@/features/training/services/workout-view";
import { plannedWeekdays } from "@/features/training/titles";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const NOW = new Date("2026-11-16T17:00:00Z");
const TODAY = toLocalDate(NOW);
const HOME: Equipment[] = ["dumbbell", "bench"];

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

const gymInput = (overrides: Partial<GymInput> = {}): GymInput => ({
  name: "Keller",
  type: "home",
  equipment: HOME,
  plateUnit: null,
  barWeight: null,
  plates: null,
  weightRules: [],
  ...overrides,
});

const customInput: CustomExerciseInput = {
  name: "Kabel-Y-Raise",
  type: "weight_reps",
  mechanic: "isolation",
  pattern: "shoulder_raise",
  primary: ["side_delts"],
  secondary: ["traps", "side_delts"],
  equipment: ["cable"],
  note: "Griff auf Hüfthöhe\nArme im Y nach oben führen",
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

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

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

describe("gym profiles", () => {
  it("keeps the first location active and adds further ones inactive", async () => {
    const id = await createGym(testDb.db, annaId, gymInput());
    const gyms = await listGyms(testDb.db, annaId);
    expect(gyms).toHaveLength(2);
    expect(gyms.find((gym) => gym.id === id)?.isActive).toBe(false);
    expect(gyms.filter((gym) => gym.isActive)).toHaveLength(1);

    const firstOfEddi = await createGym(testDb.db, eddiId, gymInput());
    expect((await getGym(testDb.db, eddiId, firstOfEddi)).isActive).toBe(true);
  });

  it("stores bar, plates and weight rules", async () => {
    const id = await createGym(
      testDb.db,
      annaId,
      gymInput({
        plateUnit: "lbs",
        barWeight: 45,
        plates: [{ weight: 45, pairs: 2 }],
        weightRules: [{ equipment: "dumbbell", unit: "lbs", increment: 5, values: [10, 15, 20] }],
      }),
    );
    const gym = await getGym(testDb.db, annaId, id);
    expect(gym).toMatchObject({ plateUnit: "lbs", barWeight: 45, plates: [{ weight: 45, pairs: 2 }] });
    expect(gym.weightRules[0]).toMatchObject({ equipment: "dumbbell", unit: "lbs", values: [10, 15, 20] });
  });

  it("protects locations of other users and the active location", async () => {
    const id = await createGym(testDb.db, annaId, gymInput());
    await expectAppError(getGym(testDb.db, eddiId, id), "NOT_FOUND");
    await expectAppError(updateGym(testDb.db, eddiId, id, gymInput({ name: "Meins" })), "NOT_FOUND");
    await expectAppError(setActiveGym(testDb.db, eddiId, id), "NOT_FOUND");
    await expectAppError(deleteGym(testDb.db, eddiId, id), "NOT_FOUND");

    await setActiveGym(testDb.db, annaId, id);
    await expectAppError(deleteGym(testDb.db, annaId, id), "GYM_ACTIVE");
    const other = (await listGyms(testDb.db, annaId)).find((gym) => !gym.isActive);
    await deleteGym(testDb.db, annaId, other!.id);
    expect(await listGyms(testDb.db, annaId)).toHaveLength(1);
  });

  it("keeps bar settings when the questionnaire is filled in again", async () => {
    const [active] = await listGyms(testDb.db, annaId);
    await updateGym(testDb.db, annaId, active.id, gymInput({ type: "gym", equipment: [...EQUIPMENT], plateUnit: "kg", barWeight: 15, plates: [{ weight: 10, pairs: 2 }] }));
    await saveOnboarding(testDb.db, annaId, { ...onboarding, locationType: "home", equipment: HOME });
    const [after] = await listGyms(testDb.db, annaId);
    expect(after).toMatchObject({ id: active.id, type: "home", equipment: HOME, barWeight: 15 });
  });

  it("adapts the plan to the active location without changing the stored plan", async () => {
    const full = await getActivePlan(testDb.db, annaId, TODAY);
    const home = await createGym(testDb.db, annaId, gymInput());
    await setActiveGym(testDb.db, annaId, home);

    const adapted = await getActivePlan(testDb.db, annaId, TODAY);
    const exercises = adapted!.days.flatMap((day) => day.exercises);
    for (const entry of exercises) expect(isExerciseAvailable(entry.exercise, HOME)).toBe(true);
    expect(exercises.some((entry) => entry.reason === "equipment")).toBe(true);

    const stored = await listFolders(testDb.db, annaId);
    expect(stored[0].days[0].exercises.map((entry) => entry.exercise.id)).toEqual(
      full!.days[0].exercises.map((entry) => entry.exercise.id),
    );
  });

  it("starts the workout with the replacements and remembers the location", async () => {
    const home = await createGym(testDb.db, annaId, gymInput());
    await setActiveGym(testDb.db, annaId, home);
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id, NOW);
    const view = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(view.exercises.map((exercise) => exercise.exerciseId)).toEqual(plan!.days[0].exercises.map((entry) => entry.exercise.id));
    const [session] = await testDb.db.select().from(workoutSession).where(eq(workoutSession.id, sessionId));
    expect(session.gymProfileId).toBe(home);
  });

  it("uses the travel location during a travel vacation", async () => {
    const hotel = await createGym(testDb.db, annaId, gymInput({ name: "Hotel", type: "travel", equipment: [] }));
    await saveTrainingSettings(testDb.db, annaId, {
      vacation: { type: "travel", from: TODAY, until: addDays(TODAY, 6), gymProfileId: hotel },
    });
    expect((await getTrainingContext(testDb.db, annaId, TODAY)).gym?.id).toBe(hotel);
    expect((await getTrainingContext(testDb.db, annaId, addDays(TODAY, 7))).gym?.id).not.toBe(hotel);
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    for (const entry of plan!.days.flatMap((day) => day.exercises)) expect(entry.exercise.equipment).toEqual([]);
  });
});

describe("weights per location", () => {
  it("logs dumbbells in lbs and the barbell in kg and offers the plate setup", async () => {
    const [active] = await listGyms(testDb.db, annaId);
    await updateGym(
      testDb.db,
      annaId,
      active.id,
      gymInput({
        type: "gym",
        equipment: [...EQUIPMENT],
        weightRules: [{ equipment: "dumbbell", unit: "lbs", increment: null, values: [20, 25, 30, 35] }],
      }),
    );
    const folder = await createFolder(testDb.db, annaId, "Test", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Mix");
    await saveRoutine(testDb.db, annaId, routine, {
      name: "Mix",
      weekday: 0,
      folderId: folder,
      exercises: [routineExercise("dumbbell-bench-press"), routineExercise("barbell-back-squat")],
    });

    const first = await startWorkout(testDb.db, annaId, routine, NOW);
    const done = await completeFirstExercise(annaId, first, toKg(25, "lbs"), 12, NOW);
    expect(done.unit).toBe("lbs");
    expect(done.bar).toBeNull();

    const second = await startWorkout(testDb.db, annaId, routine, new Date(NOW.getTime() + 2 * 86_400_000));
    const view = await getWorkoutView(testDb.db, annaId, second);
    const [dumbbell, squat] = view.exercises;
    // 12 Wiederholungen am oberen Ende: nächste vorhandene Hantel (30 lbs), nicht +2 kg.
    expect(dumbbell.sets[0].targetWeightKg).toBeCloseTo(toKg(30, "lbs"), 2);
    expect(dumbbell.sets[0].targetReps).toBe(8);
    expect(squat.unit).toBe("kg");
    expect(squat.bar).toMatchObject({ unit: "kg", barWeight: 20 });
  });
});

describe("exclusions and injury mode", () => {
  it("replaces an excluded exercise in the plan and lets it back in", async () => {
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    const target = plan!.days[0].exercises[0].exercise.id;
    await setExerciseExcluded(testDb.db, annaId, target, true);
    const adapted = await getActivePlan(testDb.db, annaId, TODAY);
    const first = adapted!.days[0].exercises[0];
    expect(first.exercise.id).not.toBe(target);
    expect(first).toMatchObject({ reason: "excluded" });
    expect(first.replaces?.id).toBe(target);

    await setExerciseExcluded(testDb.db, annaId, target, false);
    expect((await getActivePlan(testDb.db, annaId, TODAY))!.days[0].exercises[0].exercise.id).toBe(target);
    await expectAppError(setExerciseExcluded(testDb.db, eddiId, target, true), "PROFILE_REQUIRED");
  });

  it("avoids the movement patterns of an injured region right away", async () => {
    await saveInjuries(testDb.db, annaId, ["knee", "shoulder"], "  zwickt  ");
    const avoided = avoidedPatterns(["knee", "shoulder"]);
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    for (const entry of plan!.days.flatMap((day) => day.exercises)) expect(avoided.has(entry.exercise.pattern)).toBe(false);
    const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id, NOW);
    const catalog = await getUserCatalog(testDb.db, annaId);
    for (const exercise of (await getWorkoutView(testDb.db, annaId, sessionId)).exercises) {
      expect(avoided.has(catalog.find(exercise.exerciseId)!.pattern)).toBe(false);
    }
    await expectAppError(saveInjuries(testDb.db, eddiId, ["knee"], ""), "PROFILE_REQUIRED");
  });
});

describe("custom exercises", () => {
  it("adds an own exercise to the catalogue of its owner only", async () => {
    const id = await createCustomExercise(testDb.db, annaId, customInput);
    expect(id.startsWith("custom-")).toBe(true);
    const mine = (await getUserCatalog(testDb.db, annaId)).find(id);
    expect(mine).toMatchObject({ name: "Kabel-Y-Raise", custom: true, primary: ["side_delts"], secondary: ["traps"] });
    expect(mine?.instructions).toHaveLength(2);
    expect((await getUserCatalog(testDb.db, eddiId)).find(id)).toBeNull();
    await expectAppError(updateCustomExercise(testDb.db, eddiId, id, customInput), "NOT_FOUND");
    await expectAppError(archiveCustomExercise(testDb.db, eddiId, id), "NOT_FOUND");
  });

  it("can be planned, trained and deleted without losing the history", async () => {
    const id = await createCustomExercise(testDb.db, annaId, customInput);
    const folder = await createFolder(testDb.db, annaId, "Eigenes", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Schultern");
    await saveRoutine(testDb.db, annaId, routine, { name: "Schultern", weekday: 0, folderId: folder, exercises: [routineExercise(id)] });
    const sessionId = await startWorkout(testDb.db, annaId, routine, NOW);
    await completeFirstExercise(annaId, sessionId, 10, 12, NOW);

    await updateCustomExercise(testDb.db, annaId, id, { ...customInput, name: "Y-Raise am Kabel" });
    await archiveCustomExercise(testDb.db, annaId, id);
    const catalog = await getUserCatalog(testDb.db, annaId);
    expect(catalog.all.some((exercise) => exercise.id === id)).toBe(false);
    expect(catalog.find(id)).toMatchObject({ name: "Y-Raise am Kabel", archived: true });
    expect((await getWorkoutView(testDb.db, annaId, sessionId)).exercises[0].name).toBe("Y-Raise am Kabel");
  });

  it("skips a deleted exercise when the routine is trained and removes it on save", async () => {
    const id = await createCustomExercise(testDb.db, annaId, customInput);
    const folder = await createFolder(testDb.db, annaId, "Eigenes", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Schultern");
    const save = (exercises: RoutineInput["exercises"]) =>
      saveRoutine(testDb.db, annaId, routine, { name: "Schultern", weekday: 0, folderId: folder, exercises });
    await save([routineExercise(id), routineExercise("push-up")]);
    await archiveCustomExercise(testDb.db, annaId, id);

    // Die Routine zeigt die gelöschte Übung noch (der Editor kennzeichnet sie) …
    const before = await getRoutine(testDb.db, annaId, routine);
    expect(before.day.exercises.map((entry) => [entry.exercise.id, entry.exercise.archived ?? false])).toEqual([
      [id, true],
      ["push-up", false],
    ]);
    // … das Training übernimmt sie aber nicht.
    const sessionId = await startWorkout(testDb.db, annaId, routine, NOW);
    expect((await getWorkoutView(testDb.db, annaId, sessionId)).exercises.map((exercise) => exercise.exerciseId)).toEqual([
      "push-up",
    ]);
    await finishWorkout(testDb.db, annaId, sessionId, NOW);

    // Speichern scheitert nicht, sondern entfernt die gelöschte Übung.
    await save([routineExercise(id, "g1"), routineExercise("push-up", "g1")]);
    const after = await getRoutine(testDb.db, annaId, routine);
    expect(after.day.exercises.map((entry) => [entry.exercise.id, entry.groupId])).toEqual([["push-up", null]]);
    await expectAppError(save([routineExercise("gibt-es-nicht")]), "NOT_FOUND");
  });

  it("refuses to start a routine that only has deleted exercises", async () => {
    const id = await createCustomExercise(testDb.db, annaId, customInput);
    const folder = await createFolder(testDb.db, annaId, "Eigenes", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Schultern");
    await saveRoutine(testDb.db, annaId, routine, { name: "Schultern", weekday: 0, folderId: folder, exercises: [routineExercise(id)] });
    await archiveCustomExercise(testDb.db, annaId, id);
    await expectAppError(startWorkout(testDb.db, annaId, routine, NOW), "PLAN_EMPTY");
  });
});

describe("assisted exercises", () => {
  const ASSISTED = "assisted-pull-up-machine";

  it("keeps assistance out of the volume and rates less assistance as better", async () => {
    const folder = await createFolder(testDb.db, annaId, "Rücken", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Klimmzüge");
    await saveRoutine(testDb.db, annaId, routine, { name: "Klimmzüge", weekday: 0, folderId: folder, exercises: [routineExercise(ASSISTED)] });

    const first = await startWorkout(testDb.db, annaId, routine, NOW);
    await completeFirstExercise(annaId, first, 30, 8, NOW);
    const [summary] = await listCompletedSessions(testDb.db, annaId);
    expect(summary).toMatchObject({ id: first, completedSets: 3, volumeKg: 0 });

    const later = new Date(NOW.getTime() + 2 * 86_400_000);
    const second = await startWorkout(testDb.db, annaId, routine, later);
    const view = await getWorkoutView(testDb.db, annaId, second);
    expect(view.exercises[0].bests).toMatchObject({ maxWeightKg: null, maxSetVolumeKg: null, minAssistanceKg: 30 });
    // Gewertet wird wie in der Oberfläche: weniger Unterstützung ist ein Rekord, mehr nicht.
    const record = (weightKg: number) =>
      detectRecords([{ type: "work", weightKg, reps: 8, completed: true }], view.exercises[0].bests, view.exercises[0].type);
    expect(record(25)).toEqual([{ type: "assistance", value: 25 }]);
    expect(record(35)).toEqual([]);
  });
});

describe("plan builder", () => {
  const input = (folderId: string, overrides: Partial<RoutineInput> = {}): RoutineInput => ({
    name: "Push",
    weekday: 2,
    folderId,
    exercises: [
      routineExercise("barbell-bench-press"),
      routineExercise("dumbbell-curl", "g1"),
      routineExercise("triceps-pushdown", "g1"),
      routineExercise("leg-extension", "lonely"),
    ],
    ...overrides,
  });

  it("creates folders and routines next to the weekly plan", async () => {
    const folder = await createFolder(testDb.db, annaId, "Mein Plan", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Push");
    await saveRoutine(testDb.db, annaId, routine, input(folder));

    const folders = await listFolders(testDb.db, annaId);
    expect(folders.map((item) => item.status)).toEqual(["active", "saved"]);
    const saved = folders[1];
    expect(saved).toMatchObject({ name: "Mein Plan", source: "custom", split: null });
    const day = saved.days[0];
    expect(day).toMatchObject({ name: "Push", weekday: 2, focus: null });
    expect(day.exercises.map((entry) => entry.exercise.id)).toEqual(["barbell-bench-press", "dumbbell-curl", "triceps-pushdown", "leg-extension"]);
    // Eine Gruppe mit nur einer Übung ist keine Gruppe.
    expect(day.exercises.map((entry) => entry.groupId)).toEqual([null, "g1", "g1", null]);
  });

  it("makes the first own folder the weekly plan when there is none", async () => {
    const folder = await createFolder(testDb.db, eddiId, "Start", TODAY);
    expect((await listFolders(testDb.db, eddiId))[0]).toMatchObject({ id: folder, status: "active" });
  });

  it("starts the weekly plan on the day it is activated", async () => {
    const created = "2026-10-01";
    const folder = await createFolder(testDb.db, annaId, "Mein Plan", created);
    const routine = await createRoutine(testDb.db, annaId, folder, "Push");
    await saveRoutine(testDb.db, annaId, routine, input(folder));
    await activateFolder(testDb.db, annaId, folder, NOW);

    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    expect(plan).toMatchObject({ id: folder, startDate: TODAY });
    // Regressionstest: Dienstage seit dem Anlegen des Ordners gelten nicht rückwirkend als verpasst.
    const schedule = { startDate: plan!.startDate, weekdays: plannedWeekdays(plan!.days) };
    expect(dayStatus("2026-10-06", new Set(), schedule, TODAY)).toBe("rest");
    expect(dayStatus(addDays(TODAY, 1), new Set(), schedule, TODAY)).toBe("planned");
    // Erneutes Aktivieren des schon aktiven Plans verschiebt den Start nicht.
    await activateFolder(testDb.db, annaId, folder, new Date(NOW.getTime() + 7 * 86_400_000));
    expect((await getActivePlan(testDb.db, annaId, TODAY))?.startDate).toBe(TODAY);
  });

  it("switches the weekly plan and never deletes it", async () => {
    const folder = await createFolder(testDb.db, annaId, "Mein Plan", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Push");
    await saveRoutine(testDb.db, annaId, routine, input(folder));
    const generated = (await listFolders(testDb.db, annaId))[0].id;

    await activateFolder(testDb.db, annaId, folder);
    const plan = await getActivePlan(testDb.db, annaId, TODAY);
    expect(plan).toMatchObject({ id: folder, name: "Mein Plan" });
    expect(plannedWeekdays(plan!.days)).toEqual([2]);
    await expectAppError(deleteFolder(testDb.db, annaId, folder), "PLAN_ACTIVE");

    // Ein neu erzeugter Plan archiviert den selbst gebauten nicht.
    await createPlanFromProfile(testDb.db, annaId, TODAY);
    const folders = await listFolders(testDb.db, annaId);
    expect(folders.find((item) => item.id === folder)?.status).toBe("saved");
    expect(folders.some((item) => item.id === generated)).toBe(true);
    await deleteFolder(testDb.db, annaId, folder);
    expect((await listFolders(testDb.db, annaId)).some((item) => item.id === folder)).toBe(false);
  });

  it("moves, duplicates, renames and deletes routines", async () => {
    const first = await createFolder(testDb.db, annaId, "A", TODAY);
    const second = await createFolder(testDb.db, annaId, "B", TODAY);
    const routine = await createRoutine(testDb.db, annaId, first, "Push");
    await saveRoutine(testDb.db, annaId, routine, input(second, { name: "Push neu", weekday: 0 }));
    expect((await getRoutine(testDb.db, annaId, routine)).folder.id).toBe(second);
    expect((await getRoutine(testDb.db, annaId, routine)).day).toMatchObject({ name: "Push neu", weekday: null });

    const copy = await duplicateRoutine(testDb.db, annaId, routine, "Push Kopie");
    expect((await getRoutine(testDb.db, annaId, copy)).day.exercises).toHaveLength(4);
    await renameFolder(testDb.db, annaId, second, "Zweiter");
    await deleteRoutine(testDb.db, annaId, routine);
    const folder = (await listFolders(testDb.db, annaId)).find((item) => item.id === second);
    expect(folder).toMatchObject({ name: "Zweiter" });
    expect(folder?.days.map((day) => day.id)).toEqual([copy]);
  });

  it("rejects access to routines and folders of other users", async () => {
    const folder = await createFolder(testDb.db, annaId, "Mein Plan", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Push");
    const own = await createFolder(testDb.db, eddiId, "Eddi", TODAY);
    await expectAppError(getRoutine(testDb.db, eddiId, routine), "NOT_FOUND");
    await expectAppError(saveRoutine(testDb.db, eddiId, routine, input(own)), "NOT_FOUND");
    await expectAppError(deleteRoutine(testDb.db, eddiId, routine), "NOT_FOUND");
    await expectAppError(createRoutine(testDb.db, eddiId, folder, "Fremd"), "NOT_FOUND");
    await expectAppError(activateFolder(testDb.db, eddiId, folder), "NOT_FOUND");
    await expectAppError(startWorkout(testDb.db, eddiId, routine, NOW), "NOT_FOUND");
    // Eine eigene Routine darf nicht in einen fremden Ordner verschoben werden.
    const eddiRoutine = await createRoutine(testDb.db, eddiId, own, "Meine");
    await expectAppError(saveRoutine(testDb.db, eddiId, eddiRoutine, input(folder)), "NOT_FOUND");
  });

  it("rejects unknown exercises and inverted ranges", async () => {
    const folder = await createFolder(testDb.db, annaId, "Mein Plan", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Push");
    await expectAppError(saveRoutine(testDb.db, annaId, routine, input(folder, { exercises: [routineExercise("gibt-es-nicht")] })), "NOT_FOUND");
    await expectAppError(
      saveRoutine(testDb.db, annaId, routine, input(folder, { exercises: [{ ...routineExercise("push-up"), repMin: 12, repMax: 8 }] })),
      "VALIDATION",
    );
  });

  it("carries supersets into the workout", async () => {
    const folder = await createFolder(testDb.db, annaId, "Mein Plan", TODAY);
    const routine = await createRoutine(testDb.db, annaId, folder, "Push");
    await saveRoutine(testDb.db, annaId, routine, input(folder));
    const view = await getWorkoutView(testDb.db, annaId, await startWorkout(testDb.db, annaId, routine, NOW));
    expect(view.name).toBe("Push");
    expect(view.focus).toBeNull();
    expect(view.exercises.map((exercise) => exercise.groupId)).toEqual([null, "g1", "g1", null]);
  });
});
