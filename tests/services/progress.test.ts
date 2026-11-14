import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EQUIPMENT } from "@/domain/exercises/types";
import { AppError } from "@/lib/errors";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import {
  DASHBOARD_WIDGETS,
  getDashboardWidgets,
  normalizeWidgets,
  saveDashboardWidgets,
} from "@/features/progress/services/dashboard-service";
import {
  PHOTO_MAX_BYTES,
  deletePhoto,
  getPhotoFile,
  listPhotos,
  uploadPhoto,
} from "@/features/progress/services/photo-service";
import {
  deleteMeasurement,
  getLastTrainedDates,
  getMeasurements,
  getPeriodSessions,
  getRecoveryOverrides,
  getTrainedSets,
  saveMeasurement,
  setRecoveryOverride,
} from "@/features/progress/services/progress-service";
import type { OnboardingInput } from "@/features/training/schemas";
import { createPlanFromProfile, getActivePlan } from "@/features/training/services/plan-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { finishWorkout, saveSet, startWorkout } from "@/features/training/services/workout-service";
import { getWorkoutView } from "@/features/training/services/workout-view";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const TODAY = "2026-11-16";
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
const image = (bytes: number) => new Uint8Array(bytes).fill(7).buffer;

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

/** Schließt ein Training ab: ein Aufwärmsatz und zwei Arbeitssätze in der ersten Übung. */
async function trainOnce(userId: string, startedAt: Date): Promise<string> {
  const plan = await getActivePlan(testDb.db, userId);
  const sessionId = await startWorkout(testDb.db, userId, plan!.days[0].id, startedAt);
  const view = await getWorkoutView(testDb.db, userId, sessionId);
  const exercise = view.exercises[0];
  const base = { workoutExerciseId: exercise.id, weightKg: 60, reps: 8, rir: 2, note: null, completed: true };
  await saveSet(testDb.db, userId, { ...base, id: exercise.sets[0].id, position: 0, type: "warmup" }, startedAt);
  await saveSet(testDb.db, userId, { ...base, id: exercise.sets[1].id, position: 1, type: "work" }, startedAt);
  await saveSet(testDb.db, userId, { ...base, id: exercise.sets[2].id, position: 2, type: "work", completed: false }, startedAt);
  await finishWorkout(testDb.db, userId, sessionId, new Date(startedAt.getTime() + 45 * 60_000));
  return sessionId;
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
});

describe("set history", () => {
  it("returns only completed sets of finished workouts of the user", async () => {
    await saveOnboarding(testDb.db, annaId, onboarding);
    await createPlanFromProfile(testDb.db, annaId, TODAY);
    const sessionId = await trainOnce(annaId, new Date("2026-11-16T17:00:00Z"));
    const plan = await getActivePlan(testDb.db, annaId);
    await startWorkout(testDb.db, annaId, plan!.days[0].id, new Date("2026-11-18T17:00:00Z"));

    const sets = await getTrainedSets(testDb.db, annaId);
    expect(sets.map((set) => set.type)).toEqual(["warmup", "work"]);
    expect(sets[1]).toMatchObject({ sessionId, date: TODAY, weightKg: 60, reps: 8, rir: 2 });
    expect(sets[1].completedAt.toISOString()).toBe("2026-11-16T17:00:00.000Z");
    expect(await getTrainedSets(testDb.db, eddiId)).toEqual([]);
    expect(await getTrainedSets(testDb.db, annaId, { from: "2026-11-17" })).toEqual([]);
    expect(await getTrainedSets(testDb.db, annaId, { exerciseId: "does-not-exist" })).toEqual([]);

    const sessions = await getPeriodSessions(testDb.db, annaId, "2026-11-01", "2026-11-30");
    expect(sessions).toEqual([{ id: sessionId, date: TODAY, durationMinutes: 45 }]);
  });
});

describe("last training per exercise", () => {
  it("finds the last training date beyond the eight-week window", async () => {
    // Regressionsfall: Ein Muskel, der vor neun Wochen trainiert wurde, galt als „noch nie trainiert“.
    await saveOnboarding(testDb.db, annaId, onboarding);
    await createPlanFromProfile(testDb.db, annaId, "2026-09-01");
    await trainOnce(annaId, new Date("2026-09-07T17:00:00Z"));
    const [{ exerciseId }] = await getTrainedSets(testDb.db, annaId);
    expect((await getLastTrainedDates(testDb.db, annaId)).get(exerciseId)).toBe("2026-09-07");

    await trainOnce(annaId, new Date("2026-11-16T17:00:00Z"));
    expect((await getLastTrainedDates(testDb.db, annaId)).get(exerciseId)).toBe(TODAY);
    expect((await getLastTrainedDates(testDb.db, eddiId)).size).toBe(0);
  });
});

describe("measurements and recovery overrides", () => {
  it("stores one value per site and day", async () => {
    await saveMeasurement(testDb.db, annaId, { date: "2026-11-01", site: "waist", valueCm: 88 });
    await saveMeasurement(testDb.db, annaId, { date: TODAY, site: "waist", valueCm: 87 });
    await saveMeasurement(testDb.db, annaId, { date: TODAY, site: "waist", valueCm: 86.5 });
    await saveMeasurement(testDb.db, annaId, { date: TODAY, site: "chest", valueCm: 102 });
    await saveMeasurement(testDb.db, eddiId, { date: TODAY, site: "waist", valueCm: 95 });

    const anna = await getMeasurements(testDb.db, annaId);
    expect(anna.waist).toEqual([
      { date: "2026-11-01", valueCm: 88 },
      { date: TODAY, valueCm: 86.5 },
    ]);
    expect(anna.chest).toHaveLength(1);
    expect(anna.thigh).toEqual([]);

    await deleteMeasurement(testDb.db, eddiId, "waist", "2026-11-01");
    await deleteMeasurement(testDb.db, annaId, "waist", TODAY);
    expect((await getMeasurements(testDb.db, annaId)).waist).toEqual([{ date: "2026-11-01", valueCm: 88 }]);
    expect((await getMeasurements(testDb.db, eddiId)).waist).toHaveLength(1);
  });

  it("keeps the latest manual recovery value per muscle", async () => {
    await setRecoveryOverride(testDb.db, annaId, "chest", 40, new Date("2026-11-16T08:00:00Z"));
    await setRecoveryOverride(testDb.db, annaId, "chest", 90, new Date("2026-11-16T12:00:00Z"));
    const overrides = await getRecoveryOverrides(testDb.db, annaId);
    expect(overrides.chest?.percent).toBe(90);
    expect(overrides.chest?.setAt.toISOString()).toBe("2026-11-16T12:00:00.000Z");
    expect(overrides.quads).toBeUndefined();
    expect(await getRecoveryOverrides(testDb.db, eddiId)).toEqual({});
  });
});

describe("progress photos", () => {
  it("stores photos privately and deletes file and record together", async () => {
    const bucket = testDb.env.UPLOADS;
    const id = await uploadPhoto(testDb.db, bucket, annaId, {
      data: image(1024),
      contentType: "image/jpeg",
      date: TODAY,
      note: "  Woche 1  ",
      sessionId: null,
    });
    expect(await listPhotos(testDb.db, annaId)).toEqual([{ id, date: TODAY, note: "Woche 1", sessionId: null }]);
    expect(await listPhotos(testDb.db, eddiId)).toEqual([]);

    const file = await getPhotoFile(testDb.db, bucket, annaId, id);
    expect(file?.contentType).toBe("image/jpeg");
    expect((await new Response(file?.body).arrayBuffer()).byteLength).toBe(1024);

    await expectAppError(getPhotoFile(testDb.db, bucket, eddiId, id), "NOT_FOUND");
    await expectAppError(deletePhoto(testDb.db, bucket, eddiId, id), "NOT_FOUND");
    expect((await bucket.list({ prefix: `photos/${annaId}/` })).objects).toHaveLength(1);

    await deletePhoto(testDb.db, bucket, annaId, id);
    expect(await listPhotos(testDb.db, annaId)).toEqual([]);
    expect((await bucket.list({ prefix: `photos/${annaId}/` })).objects).toHaveLength(0);
  });

  it("rejects wrong file types, empty and oversized files", async () => {
    const bucket = testDb.env.UPLOADS;
    const base = { date: TODAY, note: "", sessionId: null };
    await expectAppError(uploadPhoto(testDb.db, bucket, annaId, { ...base, data: image(10), contentType: "image/svg+xml" }), "VALIDATION");
    await expectAppError(uploadPhoto(testDb.db, bucket, annaId, { ...base, data: image(0), contentType: "image/png" }), "VALIDATION");
    await expectAppError(
      uploadPhoto(testDb.db, bucket, annaId, { ...base, data: image(PHOTO_MAX_BYTES + 1), contentType: "image/png" }),
      "VALIDATION",
    );
    expect(await listPhotos(testDb.db, annaId)).toEqual([]);
  });

  it("links a photo only to an own workout", async () => {
    await saveOnboarding(testDb.db, annaId, onboarding);
    await createPlanFromProfile(testDb.db, annaId, TODAY);
    const sessionId = await trainOnce(annaId, new Date("2026-11-16T17:00:00Z"));
    const bucket = testDb.env.UPLOADS;
    const upload = { data: image(64), contentType: "image/webp", date: TODAY, note: "", sessionId };
    await expectAppError(uploadPhoto(testDb.db, bucket, eddiId, upload), "NOT_FOUND");
    const id = await uploadPhoto(testDb.db, bucket, annaId, upload);
    expect((await listPhotos(testDb.db, annaId))[0]).toMatchObject({ id, sessionId });
  });
});

describe("dashboard settings", () => {
  it("starts with all widgets visible in the default order", async () => {
    const widgets = await getDashboardWidgets(testDb.db, annaId);
    expect(widgets.map((widget) => widget.id)).toEqual([...DASHBOARD_WIDGETS]);
    expect(widgets.every((widget) => widget.visible)).toBe(true);
  });

  it("stores order and visibility per user", async () => {
    await saveDashboardWidgets(testDb.db, annaId, [
      { id: "water", visible: true },
      { id: "training", visible: false },
    ]);
    const anna = await getDashboardWidgets(testDb.db, annaId);
    expect(anna.slice(0, 2)).toEqual([
      { id: "water", visible: true },
      { id: "training", visible: false },
    ]);
    expect(anna).toHaveLength(DASHBOARD_WIDGETS.length);
    expect((await getDashboardWidgets(testDb.db, eddiId))[0].id).toBe("training");
  });

  it("drops unknown and duplicate widgets", () => {
    const normalized = normalizeWidgets([
      { id: "weight", visible: false },
      { id: "weight", visible: true },
      { id: "does-not-exist", visible: true },
    ]);
    expect(normalized[0]).toEqual({ id: "weight", visible: false });
    expect(normalized.filter((widget) => widget.id === "weight")).toHaveLength(1);
    expect(normalized).toHaveLength(DASHBOARD_WIDGETS.length);
  });
});
