import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { trainingPlan, workoutSession } from "@/db/schema";
import { EQUIPMENT } from "@/domain/exercises/types";
import { AppError } from "@/lib/errors";
import { addDays, toLocalDate } from "@/lib/dates";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import { setsToPrefill, type SetDraft } from "@/features/training/components/workout/workout-state";
import { onboardingSchema, type OnboardingInput, type SaveSetInput } from "@/features/training/schemas";
import { getTrainingStats, listCompletedSessions } from "@/features/training/services/history-service";
import { plannedWeekdays } from "@/features/training/titles";
import { createPlanFromProfile, getActivePlan, getSwapOptions, swapPlanExercise } from "@/features/training/services/plan-service";
import { getProfile, saveOnboarding, toTrainingProfile } from "@/features/training/services/profile-service";
import {
  deleteSet,
  deleteWorkout,
  finishWorkout,
  getExerciseNotes,
  getInProgressSession,
  isOpenWorkoutConflict,
  saveExerciseNote,
  saveSet,
  startWorkout,
} from "@/features/training/services/workout-service";
import { getPreviousPerformances } from "@/features/training/services/workout-queries";
import { getWorkoutView, type WorkoutView } from "@/features/training/services/workout-view";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const TODAY = toLocalDate(new Date());

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

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

function payload(view: WorkoutView, exerciseIndex: number, setIndex: number, values: Partial<SaveSetInput>): SaveSetInput {
  const exercise = view.exercises[exerciseIndex];
  const set = exercise.sets[setIndex];
  return {
    id: set.id,
    workoutExerciseId: exercise.id,
    position: setIndex,
    type: "work",
    weightKg: 60,
    reps: 10,
    rir: 2,
    note: null,
    completed: true,
    ...values,
  };
}

/** Startet ein Training, loggt alle Sätze der ersten Übung und schließt es ab. */
async function completeWorkout(
  userId: string,
  planDayId: string,
  reps: number,
  startedAt: Date,
  weightKg = 60,
): Promise<WorkoutView> {
  const sessionId = await startWorkout(testDb.db, userId, planDayId, startedAt);
  const view = await getWorkoutView(testDb.db, userId, sessionId);
  for (let index = 0; index < view.exercises[0].sets.length; index++) {
    await saveSet(testDb.db, userId, payload(view, 0, index, { reps, weightKg }));
  }
  await finishWorkout(testDb.db, userId, sessionId, new Date(startedAt.getTime() + 50 * 60_000));
  return getWorkoutView(testDb.db, userId, sessionId);
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
  await createPlanFromProfile(db, annaId, TODAY);
});

describe("onboarding and plan", () => {
  it("stores the profile with the default training location", async () => {
    const stored = await getProfile(testDb.db, annaId);
    expect(stored?.profile.goal).toBe("muscle_gain");
    expect(stored?.locationType).toBe("gym");
    expect(stored?.equipment).toEqual([...EQUIPMENT]);
    expect(await getProfile(testDb.db, eddiId)).toBeNull();
  });

  it("stores the answers of the detailed questionnaire", async () => {
    const before = await getProfile(testDb.db, annaId);
    expect(before?.profile.focusMuscles).toEqual([]);
    expect(before?.profile.bodyFatPercent).toBeNull();

    await saveOnboarding(testDb.db, annaId, {
      ...onboarding,
      bodyFatPercent: 24,
      trainingMonths: 18,
      trainedRecently: true,
      selfAssessment: "average",
      focusMuscles: ["glutes", "chest"],
      workPostures: ["sitting", "shift_work"],
    });
    const stored = await getProfile(testDb.db, annaId);
    expect(stored?.profile).toMatchObject({
      bodyFatPercent: 24,
      trainingMonths: 18,
      trainedRecently: true,
      selfAssessment: "average",
      workPostures: ["sitting", "shift_work"],
    });
    expect(stored ? toTrainingProfile(stored).focusMuscles : null).toEqual(["glutes", "chest"]);

    const base = { ...onboarding, focusMuscles: ["glutes", "chest", "lats", "biceps"] };
    expect(onboardingSchema.safeParse(base).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...onboarding, focusMuscles: ["glutes", "chest", "lats"] }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...onboarding, focusMuscles: ["glutes", "glutes"] }).success).toBe(false);
  });

  it("creates an active plan for the chosen weekdays", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    expect(plan?.split).toBe("full_body");
    expect(plan?.days.map((day) => day.weekday)).toEqual([1, 3, 5]);
    expect(plan?.days.every((day) => day.exercises.length >= 3)).toBe(true);
    expect(await getActivePlan(testDb.db, eddiId)).toBeNull();
  });

  it("requires a profile to create a plan", async () => {
    await expectAppError(createPlanFromProfile(testDb.db, eddiId, TODAY), "PROFILE_REQUIRED");
  });

  it("archives the old plan when a new one is created", async () => {
    await saveOnboarding(testDb.db, annaId, { ...onboarding, weekdays: [1, 2, 4, 5] });
    await createPlanFromProfile(testDb.db, annaId, TODAY);
    const plans = await testDb.db.query.trainingPlan.findMany({ where: eq(trainingPlan.userId, annaId) });
    expect(plans.filter((plan) => plan.status === "active")).toHaveLength(1);
    expect(plans.filter((plan) => plan.status === "archived")).toHaveLength(1);
    expect((await getActivePlan(testDb.db, annaId))?.split).toBe("upper_lower");
  });

  it("swaps a plan exercise for an alternative that is not already planned that day", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const day = plan!.days[0];
    const target = day.exercises[0];
    const options = await getSwapOptions(testDb.db, annaId, target.id);
    expect(options.length).toBeGreaterThan(0);
    const sameDayIds = day.exercises.map((entry) => entry.exercise.id);
    for (const option of options) expect(sameDayIds).not.toContain(option.id);

    await swapPlanExercise(testDb.db, annaId, target.id, options[0].id);
    const updated = await getActivePlan(testDb.db, annaId);
    expect(updated!.days[0].exercises[0].exercise.id).toBe(options[0].id);
  });

  it("does not let another user read or change the plan", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const target = plan!.days[0].exercises[0];
    await expectAppError(getSwapOptions(testDb.db, eddiId, target.id), "NOT_FOUND");
    await expectAppError(swapPlanExercise(testDb.db, eddiId, target.id, target.exercise.id), "NOT_FOUND");
    await expectAppError(startWorkout(testDb.db, eddiId, plan!.days[0].id), "NOT_FOUND");
  });
});

describe("workout logging", () => {
  it("starts a workout with the planned sets and no targets on the first time", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id);
    const view = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(view.status).toBe("in_progress");
    expect(view.exercises.map((exercise) => exercise.exerciseId)).toEqual(
      plan!.days[0].exercises.map((entry) => entry.exercise.id),
    );
    expect(view.exercises[0].sets).toHaveLength(plan!.days[0].exercises[0].sets);
    expect(view.exercises[0].sets[0]).toMatchObject({ targetWeightKg: null, targetReps: null, completed: false });
    expect(view.exercises[0].previous).toBeNull();
    expect(view.exercises[0].bests).toBeNull();
  });

  it("continues the running workout instead of starting a second one", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const first = await startWorkout(testDb.db, annaId, plan!.days[0].id);
    const second = await startWorkout(testDb.db, annaId, plan!.days[1].id);
    expect(second).toBe(first);
    expect((await getInProgressSession(testDb.db, annaId))?.id).toBe(first);
  });

  it("keeps a single open workout when two starts arrive at the same time", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const [first, second] = await Promise.all([
      startWorkout(testDb.db, annaId, plan!.days[0].id),
      startWorkout(testDb.db, annaId, plan!.days[1].id),
    ]);
    expect(second).toBe(first);
    const open = await testDb.db.query.workoutSession.findMany({
      where: and(eq(workoutSession.userId, annaId), eq(workoutSession.status, "in_progress")),
    });
    expect(open.map((row) => row.id)).toEqual([first]);

    // Die Datenbank selbst lässt kein zweites offenes Workout zu – der Dienst erkennt den Konflikt.
    const now = new Date();
    const duplicate: unknown = await testDb.db
      .insert(workoutSession)
      .values({ id: "dup", userId: annaId, date: TODAY, status: "in_progress", startedAt: now, createdAt: now, updatedAt: now })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(isOpenWorkoutConflict(duplicate)).toBe(true);
    // Abgeschlossene Workouts und andere Nutzer sind nicht betroffen.
    await finishWorkout(testDb.db, annaId, first);
    expect(await startWorkout(testDb.db, annaId, plan!.days[1].id)).not.toBe(first);
  });

  it("saves, edits, adds and deletes sets", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id);
    let view = await getWorkoutView(testDb.db, annaId, sessionId);

    await saveSet(testDb.db, annaId, payload(view, 0, 0, { weightKg: 62.5, reps: 9, rir: 1, note: "  sauber  " }));
    await saveSet(testDb.db, annaId, payload(view, 0, 0, { weightKg: 65, reps: 8, rir: 1, note: null }));
    const extraId = crypto.randomUUID();
    await saveSet(testDb.db, annaId, {
      ...payload(view, 0, 0, {}),
      id: extraId,
      position: view.exercises[0].sets.length,
      type: "drop",
      weightKg: 40,
      reps: 12,
    });

    view = await getWorkoutView(testDb.db, annaId, sessionId);
    const sets = view.exercises[0].sets;
    expect(sets[0]).toMatchObject({ weightKg: 65, reps: 8, rir: 1, note: null, completed: true });
    expect(sets.at(-1)).toMatchObject({ id: extraId, type: "drop", weightKg: 40, reps: 12 });

    await deleteSet(testDb.db, annaId, extraId);
    view = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(view.exercises[0].sets.map((set) => set.id)).not.toContain(extraId);
  });

  it("keeps the time of the first completion when a set is corrected later", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id);
    const view = await getWorkoutView(testDb.db, annaId, sessionId);
    await saveSet(testDb.db, annaId, payload(view, 0, 0, {}), new Date("2026-11-16T10:00:00Z"));
    await saveSet(testDb.db, annaId, payload(view, 0, 0, { reps: 11 }), new Date("2026-11-16T11:00:00Z"));
    const after = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(after.exercises[0].sets[0].completedAt).toBe("2026-11-16T10:00:00.000Z");
  });

  it("does not let another user touch or see the workout", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id);
    const view = await getWorkoutView(testDb.db, annaId, sessionId);
    await expectAppError(saveSet(testDb.db, eddiId, payload(view, 0, 0, {})), "NOT_FOUND");
    await expectAppError(deleteSet(testDb.db, eddiId, view.exercises[0].sets[0].id), "NOT_FOUND");
    await expectAppError(getWorkoutView(testDb.db, eddiId, sessionId), "NOT_FOUND");
    await expectAppError(finishWorkout(testDb.db, eddiId, sessionId), "NOT_FOUND");
    await expectAppError(deleteWorkout(testDb.db, eddiId, sessionId), "NOT_FOUND");
    const untouched = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(untouched.exercises[0].sets[0].completed).toBe(false);
  });

  it("refuses to move a set into another user's exercise", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const annaSession = await startWorkout(testDb.db, annaId, plan!.days[0].id);
    const annaView = await getWorkoutView(testDb.db, annaId, annaSession);
    await saveOnboarding(testDb.db, eddiId, onboarding);
    await createPlanFromProfile(testDb.db, eddiId, TODAY);
    const eddiPlan = await getActivePlan(testDb.db, eddiId);
    const eddiSession = await startWorkout(testDb.db, eddiId, eddiPlan!.days[0].id);
    const eddiView = await getWorkoutView(testDb.db, eddiId, eddiSession);

    const hijack: SaveSetInput = { ...payload(eddiView, 0, 0, {}), id: annaView.exercises[0].sets[0].id };
    await expectAppError(saveSet(testDb.db, eddiId, hijack), "NOT_FOUND");
  });
});

describe("progression, history and streak", () => {
  it("suggests targets for the next workout from the last performance", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const day = plan!.days[0];
    const topOfRange = day.exercises[0].repMax;
    const done = await completeWorkout(annaId, day.id, topOfRange, new Date("2026-11-09T17:00:00Z"));
    expect(done.status).toBe("completed");

    const nextId = await startWorkout(testDb.db, annaId, day.id, new Date("2026-11-11T17:00:00Z"));
    const next = await getWorkoutView(testDb.db, annaId, nextId);
    const first = next.exercises[0];
    expect(first.previous?.sets[0]).toMatchObject({ weightKg: 60, reps: topOfRange });
    expect(first.sets[0].targetWeightKg).toBeGreaterThan(60);
    expect(first.sets[0].targetReps).toBe(day.exercises[0].repMin);
    expect(first.bests?.maxWeightKg).toBe(60);
    // Übungen ohne Vorwerte bleiben ohne Ziel.
    expect(next.exercises[1].sets[0].targetWeightKg).toBeNull();
  });

  it("shows previous values and records of an older workout only from workouts before it", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const day = plan!.days[0];
    const older = await completeWorkout(annaId, day.id, 10, new Date("2026-11-09T17:00:00Z"), 60);
    const newer = await completeWorkout(annaId, day.id, 10, new Date("2026-11-11T17:00:00Z"), 70);

    // Regressionstest: Früher zeigte die ältere Einheit Vorwerte und Bestwerte der späteren.
    const olderView = await getWorkoutView(testDb.db, annaId, older.id);
    expect(olderView.exercises[0].previous).toBeNull();
    expect(olderView.exercises[0].bests).toBeNull();
    const newerView = await getWorkoutView(testDb.db, annaId, newer.id);
    expect(newerView.exercises[0].previous).toMatchObject({ date: "2026-11-09" });
    expect(newerView.exercises[0].previous?.sets[0].weightKg).toBe(60);
    expect(newerView.exercises[0].bests?.maxWeightKg).toBe(60);
  });

  it("shows a deload workout as the last time but does not progress from it", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const day = plan!.days[0];
    const exerciseId = day.exercises[0].exercise.id;
    await completeWorkout(annaId, day.id, 10, new Date("2026-11-09T17:00:00Z"), 60);
    const deload = await completeWorkout(annaId, day.id, 8, new Date("2026-11-16T17:00:00Z"), 50);
    await testDb.db.update(workoutSession).set({ isDeload: true }).where(eq(workoutSession.id, deload.id));

    // Progressionsbasis: die letzte reguläre Einheit.
    const basis = await getPreviousPerformances(testDb.db, annaId, [exerciseId]);
    expect(basis.get(exerciseId)).toMatchObject({ date: "2026-11-09" });
    // Anzeige „Letztes Mal“: wirklich die letzte Einheit, auch wenn sie ein Deload war.
    const nextId = await startWorkout(testDb.db, annaId, day.id, new Date("2026-11-18T17:00:00Z"));
    const next = await getWorkoutView(testDb.db, annaId, nextId);
    expect(next.exercises[0].previous).toMatchObject({ date: "2026-11-16" });
    expect(next.exercises[0].previous?.sets[0].weightKg).toBe(50);
  });

  it("lists completed workouts with totals and removes deleted ones", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const day = plan!.days[0];
    const done = await completeWorkout(annaId, day.id, 10, new Date("2026-11-09T17:00:00Z"));
    const [summary] = await listCompletedSessions(testDb.db, annaId);
    expect(summary).toMatchObject({
      id: done.id,
      durationMinutes: 50,
      completedSets: day.exercises[0].sets,
      volumeKg: day.exercises[0].sets * 60 * 10,
    });
    expect(await listCompletedSessions(testDb.db, eddiId)).toEqual([]);

    await deleteWorkout(testDb.db, annaId, done.id);
    expect(await listCompletedSessions(testDb.db, annaId)).toEqual([]);
  });

  it("never ends a workout before it started", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const start = new Date("2026-11-09T17:00:00Z");
    const sessionId = await startWorkout(testDb.db, annaId, plan!.days[0].id, start);
    await finishWorkout(testDb.db, annaId, sessionId, new Date("2026-11-09T16:00:00Z"));
    const session = await testDb.db.query.workoutSession.findFirst({ where: eq(workoutSession.id, sessionId) });
    expect(session?.finishedAt?.toISOString()).toBe(start.toISOString());
  });

  it("counts the training streak from completed workouts only", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const weekdays = plannedWeekdays(plan!.days);
    expect((await getTrainingStats(testDb.db, annaId, weekdays, TODAY)).streak).toBe(0);

    await startWorkout(testDb.db, annaId, plan!.days[0].id);
    expect((await getTrainingStats(testDb.db, annaId, weekdays, TODAY)).streak).toBe(0);

    const running = await getInProgressSession(testDb.db, annaId);
    await finishWorkout(testDb.db, annaId, running!.id);
    const stats = await getTrainingStats(testDb.db, annaId, weekdays, TODAY);
    expect(stats.streak).toBe(1);
    expect(stats.doneThisWeek).toEqual([TODAY]);
    expect((await getTrainingStats(testDb.db, eddiId, weekdays, TODAY)).streak).toBe(0);
    expect((await getTrainingStats(testDb.db, annaId, weekdays, addDays(TODAY, 30))).streak).toBe(0);
  });
});

describe("exercise notes", () => {
  it("stores one note per user and exercise and deletes it when emptied", async () => {
    const plan = await getActivePlan(testDb.db, annaId);
    const exerciseId = plan!.days[0].exercises[0].exercise.id;
    await saveExerciseNote(testDb.db, annaId, exerciseId, "  Sitz auf Stufe 4  ");
    await saveExerciseNote(testDb.db, annaId, exerciseId, "Sitz auf Stufe 5");
    expect((await getExerciseNotes(testDb.db, annaId, [exerciseId])).get(exerciseId)).toBe("Sitz auf Stufe 5");
    expect((await getExerciseNotes(testDb.db, eddiId, [exerciseId])).size).toBe(0);

    await saveExerciseNote(testDb.db, annaId, exerciseId, "   ");
    expect((await getExerciseNotes(testDb.db, annaId, [exerciseId])).size).toBe(0);
    await expectAppError(saveExerciseNote(testDb.db, annaId, "does-not-exist", "x"), "NOT_FOUND");
  });
});

describe("onboarding validation", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("rejects duplicate weekdays", () => {
    expect(onboardingSchema.safeParse({ ...onboarding, weekdays: [1, 1] }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...onboarding, weekdays: [1, 3, 3, 5] }).success).toBe(false);
    expect(onboardingSchema.safeParse(onboarding).success).toBe(true);
  });

  it("checks the birth year against the current year in the app time zone", () => {
    // In Berlin ist schon 2027, in UTC noch 2026: Wer 2015 geboren ist, ist dort 12.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    expect(onboardingSchema.safeParse({ ...onboarding, birthYear: 2015 }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...onboarding, birthYear: 2016 }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...onboarding, birthYear: 1927 }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...onboarding, birthYear: 1926 }).success).toBe(false);
  });
});

describe("prefilling sets after a completed one", () => {
  const draft = (id: string, type: SetDraft["type"], weightText = "", repsText = ""): SetDraft => ({
    id,
    type,
    weightText,
    repsText,
    rir: null,
    note: "",
    completed: false,
  });

  it("does not hand the warm-up weight to the work sets", () => {
    const sets = [draft("w1", "warmup", "20", "8"), draft("w2", "warmup"), draft("a", "work"), draft("b", "work")];
    expect(setsToPrefill(sets, sets[0]).map((set) => set.id)).toEqual(["w2"]);
  });

  it("fills only empty, open sets of the same type", () => {
    const sets = [
      draft("a", "work", "60", "10"),
      draft("b", "work"),
      draft("c", "work", "62,5", ""),
      { ...draft("d", "work"), completed: true },
      draft("e", "drop"),
      draft("f", "work"),
    ];
    expect(setsToPrefill(sets, sets[0]).map((set) => set.id)).toEqual(["b", "f"]);
  });
});
