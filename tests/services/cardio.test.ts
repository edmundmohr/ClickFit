import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_INTERVAL } from "@/domain/cardio/plan";
import { EQUIPMENT } from "@/domain/exercises/types";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import type { ActivityInput, CardioPlanEntryInput } from "@/features/cardio/schemas";
import { activitySchema, cardioPlanEntrySchema, saveCardioPlanEntrySchema } from "@/features/cardio/schemas";
import {
  deleteActivity,
  getActivityLoads,
  getWeekSummary,
  listActivities,
  logActivity,
} from "@/features/cardio/services/activity-service";
import {
  DEFAULT_SESSIONS_PER_WEEK,
  addCardioPlanEntry,
  createCardioPlanFromProfile,
  deleteCardioPlanEntry,
  listCardioPlan,
  updateCardioPlanEntry,
} from "@/features/cardio/services/cardio-plan-service";
import { getRecoverySnapshot } from "@/features/progress/services/recovery-service";
import { setRecoveryOverride } from "@/features/progress/services/progress-service";
import type { OnboardingInput } from "@/features/training/schemas";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { AppError } from "@/lib/errors";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

/** Montag; die Woche reicht bis Sonntag, 22.11. */
const TODAY = "2026-11-16";
const NOW = new Date("2026-11-16T17:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

const onboarding: OnboardingInput = {
  goal: "fat_loss",
  experience: "intermediate",
  weekdays: [1, 3, 5],
  sessionMinutes: 60,
  locationType: "gym",
  equipment: [...EQUIPMENT],
  cardio: { wanted: true, types: ["running", "other"], sessionsPerWeek: 3 },
  sex: "male",
  birthYear: 1996,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "light",
  injuries: [],
  injuryNote: "",
  excludedExerciseIds: [],
};

const run: ActivityInput = {
  date: TODAY,
  type: "running",
  durationSeconds: 3600,
  distanceMeters: 10_000,
  avgHeartRate: 150,
  zone: 3,
  intensity: "moderate",
  intervals: null,
  note: "Runde am Fluss",
};

const planEntry: CardioPlanEntryInput = {
  weekday: 2,
  type: "cycling",
  minutes: 40,
  zone: 2,
  intervals: null,
  note: null,
};

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

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.reset();
  annaId = (await createUserWithPassword(testDb.db, { username: "anna", password: TEST_PASSWORDS.anna, role: "user" })).id;
  eddiId = (await createUserWithPassword(testDb.db, { username: "eddi", password: TEST_PASSWORDS.eddi, role: "user" })).id;
});

describe("activities", () => {
  it("logs an activity and lists it with all values", async () => {
    const id = await logActivity(
      testDb.db,
      annaId,
      { ...run, intervals: { workSeconds: 60, restSeconds: 90, repeats: 6 } },
      NOW,
    );
    const [item, ...rest] = await listActivities(testDb.db, annaId, TODAY, TODAY);
    expect(rest).toEqual([]);
    expect(item).toEqual({
      id,
      date: TODAY,
      type: "running",
      durationSeconds: 3600,
      distanceMeters: 10_000,
      avgHeartRate: 150,
      zone: 3,
      intensity: "moderate",
      intervals: { workSeconds: 60, restSeconds: 90, repeats: 6 },
      note: "Runde am Fluss",
      endedAt: NOW,
    });
  });

  it("uses noon as the end of a session logged for an earlier day", async () => {
    await logActivity(testDb.db, annaId, { ...run, date: "2026-11-14", note: "" }, NOW);
    const [item] = await listActivities(testDb.db, annaId, "2026-11-14", "2026-11-14");
    expect(item.endedAt).toEqual(new Date("2026-11-14T12:00:00Z"));
    expect(item.note).toBeNull();
  });

  it("rejects a date in the future", async () => {
    await expectAppError(logActivity(testDb.db, annaId, { ...run, date: "2026-11-17" }, NOW), "VALIDATION");
    expect(await listActivities(testDb.db, annaId, "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("lists only the own activities of the period, newest first", async () => {
    await logActivity(testDb.db, annaId, { ...run, date: "2026-11-10", type: "cycling" }, NOW);
    await logActivity(testDb.db, annaId, { ...run, date: "2026-11-15", type: "yoga" }, NOW);
    await logActivity(testDb.db, annaId, run, NOW);
    await logActivity(testDb.db, annaId, { ...run, date: "2026-10-01" }, NOW);
    await logActivity(testDb.db, eddiId, { ...run, type: "football" }, NOW);

    const items = await listActivities(testDb.db, annaId, "2026-11-10", TODAY);
    expect(items.map((item) => [item.date, item.type])).toEqual([
      [TODAY, "running"],
      ["2026-11-15", "yoga"],
      ["2026-11-10", "cycling"],
    ]);
    expect(await listActivities(testDb.db, eddiId, "2026-11-10", TODAY)).toHaveLength(1);
  });

  it("deletes an own activity but not one of another user", async () => {
    const id = await logActivity(testDb.db, annaId, run, NOW);
    await expectAppError(deleteActivity(testDb.db, eddiId, id), "NOT_FOUND");
    expect(await listActivities(testDb.db, annaId, TODAY, TODAY)).toHaveLength(1);

    await deleteActivity(testDb.db, annaId, id);
    expect(await listActivities(testDb.db, annaId, TODAY, TODAY)).toEqual([]);
    await expectAppError(deleteActivity(testDb.db, annaId, id), "NOT_FOUND");
  });

  it("sums minutes and distance of the week", async () => {
    expect(await getWeekSummary(testDb.db, annaId, TODAY)).toEqual({
      from: "2026-11-16",
      to: "2026-11-22",
      sessions: 0,
      durationSeconds: 0,
      distanceMeters: 0,
    });

    const sunday = new Date("2026-11-22T17:00:00Z");
    await logActivity(testDb.db, annaId, run, sunday);
    await logActivity(testDb.db, annaId, { ...run, date: "2026-11-22", durationSeconds: 1800, distanceMeters: null }, sunday);
    await logActivity(testDb.db, annaId, { ...run, date: "2026-11-15" }, sunday);
    await logActivity(testDb.db, eddiId, run, sunday);

    const summary = await getWeekSummary(testDb.db, annaId, "2026-11-18");
    expect(summary).toEqual({
      from: "2026-11-16",
      to: "2026-11-22",
      sessions: 2,
      durationSeconds: 5400,
      distanceMeters: 10_000,
    });
  });
});

describe("activity loads and recovery", () => {
  it("converts the activities since a point in time into muscle loads", async () => {
    const id = await logActivity(testDb.db, annaId, run, NOW);
    await logActivity(testDb.db, annaId, { ...run, date: "2026-11-10" }, NOW);
    await logActivity(testDb.db, eddiId, { ...run, type: "climbing" }, NOW);

    const loads = await getActivityLoads(testDb.db, annaId, new Date(NOW.getTime() - 24 * HOUR_MS));
    expect(new Set(loads.map((load) => load.id))).toEqual(new Set([id]));
    expect(loads.find((load) => load.muscle === "quads")).toEqual({ id, muscle: "quads", effectiveSets: 5, at: NOW });
    expect(loads.some((load) => load.muscle === "forearms")).toBe(false);

    expect(await getActivityLoads(testDb.db, annaId, new Date(NOW.getTime() + 1))).toEqual([]);
    const all = await getActivityLoads(testDb.db, annaId, new Date("2026-11-01T00:00:00Z"));
    expect(new Set(all.map((load) => load.id)).size).toBe(2);
  });

  it("includes cardio in the recovery snapshot", async () => {
    const later = new Date(NOW.getTime() + HOUR_MS);
    const fresh = await getRecoverySnapshot(testDb.db, annaId, () => null, later);
    expect(fresh.quads).toBe(100);

    await logActivity(testDb.db, annaId, { ...run, intensity: "hard" }, NOW);
    const tired = await getRecoverySnapshot(testDb.db, annaId, () => null, later);
    expect(tired.quads).toBeLessThan(50);
    expect(tired.chest).toBe(100);
    // Die Belastung eines anderen Nutzers zählt nicht.
    expect((await getRecoverySnapshot(testDb.db, eddiId, () => null, later)).quads).toBe(100);
    // Nach der Rückschau ist die Einheit verarbeitet.
    const nextWeek = new Date(NOW.getTime() + 6 * 24 * HOUR_MS);
    expect((await getRecoverySnapshot(testDb.db, annaId, () => null, nextWeek)).quads).toBe(100);
  });

  it("lets a manual recovery value replace earlier cardio", async () => {
    await logActivity(testDb.db, annaId, { ...run, intensity: "hard" }, NOW);
    const later = new Date(NOW.getTime() + HOUR_MS);
    await setRecoveryOverride(testDb.db, annaId, "quads", 100, later);
    const status = await getRecoverySnapshot(testDb.db, annaId, () => null, new Date(later.getTime() + HOUR_MS));
    expect(status.quads).toBe(100);
    expect(status.calves).toBeLessThan(100);
  });
});

describe("cardio plan", () => {
  it("adds, lists, changes and deletes entries", async () => {
    const sunday = await addCardioPlanEntry(testDb.db, annaId, { ...planEntry, weekday: 7, type: "running" }, NOW);
    const tuesday = await addCardioPlanEntry(testDb.db, annaId, { ...planEntry, note: "locker" }, NOW);
    expect(await listCardioPlan(testDb.db, annaId)).toEqual([
      { id: tuesday, weekday: 2, type: "cycling", minutes: 40, zone: 2, intervals: null, note: "locker" },
      { id: sunday, weekday: 7, type: "running", minutes: 40, zone: 2, intervals: null, note: null },
    ]);

    await updateCardioPlanEntry(testDb.db, annaId, tuesday, {
      weekday: 4,
      type: "rowing",
      minutes: 30,
      zone: 4,
      intervals: DEFAULT_INTERVAL,
      note: "",
    });
    const changed = (await listCardioPlan(testDb.db, annaId)).find((entry) => entry.id === tuesday);
    expect(changed).toEqual({
      id: tuesday,
      weekday: 4,
      type: "rowing",
      minutes: 30,
      zone: 4,
      intervals: DEFAULT_INTERVAL,
      note: null,
    });

    await deleteCardioPlanEntry(testDb.db, annaId, tuesday);
    expect((await listCardioPlan(testDb.db, annaId)).map((entry) => entry.id)).toEqual([sunday]);
  });

  it("does not let a user change or delete entries of another user", async () => {
    const id = await addCardioPlanEntry(testDb.db, annaId, planEntry, NOW);
    await expectAppError(updateCardioPlanEntry(testDb.db, eddiId, id, { ...planEntry, minutes: 5 }), "NOT_FOUND");
    await expectAppError(deleteCardioPlanEntry(testDb.db, eddiId, id), "NOT_FOUND");
    expect(await listCardioPlan(testDb.db, eddiId)).toEqual([]);
    expect(await listCardioPlan(testDb.db, annaId)).toEqual([{ id, ...planEntry }]);
    await expectAppError(updateCardioPlanEntry(testDb.db, annaId, "missing", planEntry), "NOT_FOUND");
    await expectAppError(deleteCardioPlanEntry(testDb.db, annaId, "missing"), "NOT_FOUND");
  });

  it("needs a profile to create the plan", async () => {
    await expectAppError(createCardioPlanFromProfile(testDb.db, annaId, NOW), "PROFILE_REQUIRED");
  });

  it("creates the plan from the profile and replaces the old entries", async () => {
    await saveOnboarding(testDb.db, annaId, onboarding, NOW);
    await addCardioPlanEntry(testDb.db, annaId, { ...planEntry, weekday: 1, minutes: 99 }, NOW);
    const foreign = await addCardioPlanEntry(testDb.db, eddiId, planEntry, NOW);

    expect(await createCardioPlanFromProfile(testDb.db, annaId, NOW)).toBe(3);
    const plan = await listCardioPlan(testDb.db, annaId);
    // Trainingstage sind Mo, Mi, Fr: Cardio liegt auf den freien Tagen; `other` wird zum Crosstrainer.
    expect(plan.map((entry) => [entry.weekday, entry.type])).toEqual([
      [2, "running"],
      [4, "cross_trainer"],
      [6, "running"],
    ]);
    expect(plan.filter((entry) => entry.intervals)).toHaveLength(1);
    expect(plan.filter((entry) => !entry.intervals).every((entry) => entry.zone === 2 && entry.minutes === 45)).toBe(true);
    expect(plan.some((entry) => entry.minutes === 99)).toBe(false);

    // Erneutes Erzeugen ergibt denselben Plan und lässt fremde Einträge stehen.
    await createCardioPlanFromProfile(testDb.db, annaId, NOW);
    const again = await listCardioPlan(testDb.db, annaId);
    const withoutId = (entries: typeof plan) => entries.map((entry) => ({ ...entry, id: "" }));
    expect(withoutId(again)).toEqual(withoutId(plan));
    expect(again.map((entry) => entry.id)).not.toEqual(plan.map((entry) => entry.id));
    expect((await listCardioPlan(testDb.db, eddiId)).map((entry) => entry.id)).toEqual([foreign]);
  });

  it("plans a light start when the profile has no cardio", async () => {
    await saveOnboarding(testDb.db, annaId, { ...onboarding, cardio: { wanted: false, types: [], sessionsPerWeek: 0 } }, NOW);
    expect(await createCardioPlanFromProfile(testDb.db, annaId, NOW)).toBe(DEFAULT_SESSIONS_PER_WEEK);
    const plan = await listCardioPlan(testDb.db, annaId);
    expect(plan.every((entry) => entry.type === "walking" && entry.intervals === null)).toBe(true);
  });
});

describe("cardio schemas", () => {
  it("accept valid input and trim the note", () => {
    expect(activitySchema.parse({ ...run, note: "  kurz  " }).note).toBe("kurz");
    expect(cardioPlanEntrySchema.safeParse(planEntry).success).toBe(true);
    expect(saveCardioPlanEntrySchema.parse({ ...planEntry, id: "abc" }).id).toBe("abc");
  });

  it("reject invalid values", () => {
    expect(activitySchema.safeParse({ ...run, date: "2026-02-30" }).success).toBe(false);
    expect(activitySchema.safeParse({ ...run, type: "chess" }).success).toBe(false);
    expect(activitySchema.safeParse({ ...run, durationSeconds: 0 }).success).toBe(false);
    expect(activitySchema.safeParse({ ...run, distanceMeters: -5 }).success).toBe(false);
    expect(activitySchema.safeParse({ ...run, zone: 6 }).success).toBe(false);
    expect(activitySchema.safeParse({ ...run, intensity: "brutal" }).success).toBe(false);
    expect(activitySchema.safeParse({ ...run, intervals: { workSeconds: 60, restSeconds: 90, repeats: 0 } }).success).toBe(false);
    // Zusatzsport lässt sich loggen, aber nicht als Cardio planen.
    expect(activitySchema.safeParse({ ...run, type: "football" }).success).toBe(true);
    expect(cardioPlanEntrySchema.safeParse({ ...planEntry, type: "football" }).success).toBe(false);
    expect(cardioPlanEntrySchema.safeParse({ ...planEntry, weekday: 8 }).success).toBe(false);
    expect(cardioPlanEntrySchema.safeParse({ ...planEntry, minutes: 0 }).success).toBe(false);
  });
});
