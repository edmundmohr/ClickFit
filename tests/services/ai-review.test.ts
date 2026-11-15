import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { aiReview, healthMetric, workoutExercise, workoutSession, workoutSet } from "@/db/schema";
import { setAiConsent, getAiStatus } from "@/features/ai/services/ai-service";
import { estimateBodyFat } from "@/features/ai/services/body-fat-service";
import { loadAiSnapshot } from "@/features/ai/services/data-snapshot";
import { suggestPlanChanges } from "@/features/ai/services/plan-refinement";
import { createReview, deleteReview, getLatestReview } from "@/features/ai/services/review-service";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import { logActivity } from "@/features/cardio/services/activity-service";
import { logRoutine } from "@/features/mobility/services/mobility-service";
import { addLogEntry } from "@/features/nutrition/services/diary-service";
import { addWater, saveWeight } from "@/features/nutrition/services/tracking-service";
import { uploadPhoto } from "@/features/progress/services/photo-service";
import { saveMeasurement } from "@/features/progress/services/progress-service";
import type { OnboardingInput } from "@/features/training/schemas";
import { createPlanFromProfile } from "@/features/training/services/plan-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { saveTrainingSettings } from "@/features/training/services/settings-service";
import { saveExerciseNote } from "@/features/training/services/workout-service";
import { AppError } from "@/lib/errors";
import { addDays, toLocalDate } from "@/lib/dates";
import type { LlmProvider, LlmRequest, LlmResult } from "@/lib/llm";
import { newId } from "@/lib/tokens";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const NOW = new Date("2026-11-16T17:00:00Z");
const TODAY = toLocalDate(NOW);
const CURL = "dumbbell-curl";

const onboarding: OnboardingInput = {
  goal: "fat_loss",
  experience: "intermediate",
  weekdays: [1, 3, 5],
  sessionMinutes: 60,
  locationType: "home",
  equipment: ["dumbbell", "bench"],
  cardio: { wanted: false, types: [], sessionsPerWeek: 0 },
  sex: "female",
  birthYear: 1992,
  heightCm: 170,
  weightKg: 65,
  activityLevel: "light",
  injuries: ["knee"],
  injuryNote: "Knie zwickt beim Treppensteigen",
  excludedExerciseIds: [],
};

type AnyRequest = LlmRequest<z.ZodType>;

function fakeProvider(reply: (request: AnyRequest) => LlmResult<unknown>) {
  const calls: AnyRequest[] = [];
  const provider: LlmProvider = {
    name: "Testanbieter",
    model: "test-model",
    generate: async (request) => {
      calls.push(request);
      const result = reply(request);
      if (result.status === "ok") return { ...result, data: request.schema.parse(result.data) } as never;
      return result as never;
    },
  };
  return { provider, calls };
}

const ok = (data: unknown): LlmResult<unknown> => ({ status: "ok", data, model: "test-model" });

const REVIEW = {
  summary: "Du bist auf einem guten Weg.",
  answer: "Ja, etwas mehr Eiweiß hilft.",
  areas: [{ area: "nutrition", status: "watch", text: "Eiweiß liegt unter dem Ziel." }],
  recommendations: [{ area: "nutrition", text: "Iss zu jeder Mahlzeit eine Eiweißquelle." }],
  dataGaps: [],
};

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (char) => char.charCodeAt(0),
);

/** Abgeschlossene Einheit mit einem Satz Bizepscurls und einer Satznotiz. */
async function addWorkout(userId: string, date: string, weightKg: number, note: string | null): Promise<void> {
  const sessionId = newId();
  const exerciseId = newId();
  const at = new Date(`${date}T17:00:00Z`);
  await testDb.db.insert(workoutSession).values({
    id: sessionId,
    userId,
    date,
    name: "Oberkörper",
    status: "completed",
    startedAt: at,
    finishedAt: new Date(at.getTime() + 50 * 60000),
    createdAt: at,
    updatedAt: at,
  });
  await testDb.db.insert(workoutExercise).values({
    id: exerciseId,
    sessionId,
    userId,
    position: 0,
    exerciseId: CURL,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSeconds: 90,
  });
  await testDb.db.insert(workoutSet).values({
    id: newId(),
    workoutExerciseId: exerciseId,
    position: 0,
    weightKg,
    reps: 10,
    rir: 2,
    note,
    completedAt: at,
  });
}

let testDb: TestDatabase;
let annaId: string;
let eddiId: string;

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

  await addWorkout(annaId, addDays(TODAY, -7), 10, null);
  await addWorkout(annaId, addDays(TODAY, -2), 12, "Ellbogen zieht leicht");
  await saveExerciseNote(db, annaId, CURL, "Mit Supination");
  await saveWeight(db, annaId, addDays(TODAY, -10), 66.2);
  await saveWeight(db, annaId, addDays(TODAY, -1), 65.4);
  await saveMeasurement(db, annaId, { date: addDays(TODAY, -20), site: "waist", valueCm: 78 });
  await saveMeasurement(db, annaId, { date: addDays(TODAY, -1), site: "waist", valueCm: 76.5 });
  await addLogEntry(db, annaId, { date: addDays(TODAY, -1), meal: "breakfast", foodRef: "basic:oats-rolled", amount: 100, amountUnit: "g" });
  await addWater(db, annaId, addDays(TODAY, -1), 1500);
  await logActivity(
    db,
    annaId,
    {
      date: addDays(TODAY, -3),
      type: "running",
      durationSeconds: 1800,
      distanceMeters: 5000,
      avgHeartRate: 150,
      zone: 3,
      intensity: "moderate",
      intervals: null,
      note: "Waden fest",
    },
    NOW,
  );
  await logRoutine(db, annaId, { routineId: "morning-5", date: addDays(TODAY, -4), durationSeconds: 300 });
  await saveTrainingSettings(db, annaId, { cycle: { enabled: true, lastStart: addDays(TODAY, -2), lengthDays: 28 } }, NOW);
  await db.insert(healthMetric).values([
    { userId: annaId, type: "steps", date: addDays(TODAY, -1), value: 9876, source: "api", updatedAt: NOW },
    { userId: annaId, type: "resting_heart_rate", date: addDays(TODAY, -1), value: 58, source: "api", updatedAt: NOW },
    { userId: eddiId, type: "steps", date: addDays(TODAY, -1), value: 1234, source: "api", updatedAt: NOW },
  ]);
  await saveWeight(db, eddiId, addDays(TODAY, -1), 99.9);
});

describe("AI data snapshot", () => {
  it("collects the data of all areas for one user only", async () => {
    const snapshot = await loadAiSnapshot(testDb.db, annaId, TODAY, NOW);
    expect(snapshot.profile).toMatchObject({ sex: "female", ageYears: 34, injuryNote: "Knie zwickt beim Treppensteigen" });
    expect(snapshot.settings.cycle).toMatchObject({ day: 3, phase: "menstruation" });
    expect(snapshot.training.sessions).toHaveLength(2);
    expect(snapshot.training.exercises[0]).toMatchObject({ exerciseId: CURL, sessions: 2, first: { weightKg: 10 }, last: { weightKg: 12 } });
    expect(snapshot.training.exerciseNotes[0].note).toBe("Mit Supination");
    expect(snapshot.training.setNotes[0]).toMatchObject({ note: "Ellbogen zieht leicht" });
    expect(snapshot.training.plan.length).toBeGreaterThan(0);
    expect(snapshot.recovery.biceps).toBe(100);
    expect(Object.keys(snapshot.recovery)).toContain("quads");
    expect(snapshot.nutrition.kcal).toHaveLength(1);
    expect(snapshot.nutrition.waterMl[0].total).toBe(1500);
    expect(snapshot.body.weights.map((point) => point.weightKg)).toEqual([66.2, 65.4]);
    expect(snapshot.body.measurements).toEqual([
      { site: "waist", first: { date: addDays(TODAY, -20), value: 78 }, last: { date: addDays(TODAY, -1), value: 76.5 } },
    ]);
    expect(snapshot.cardio.activities[0]).toMatchObject({ type: "running", minutes: 30, distanceKm: 5, note: "Waden fest" });
    expect(snapshot.mobility).toHaveLength(1);
    expect(snapshot.steps[0].total).toBe(9876);
    expect(snapshot.restingHeartRate[0].average).toBe(58);
  });

  it("is empty but valid for a user without data", async () => {
    const snapshot = await loadAiSnapshot(testDb.db, eddiId, TODAY, NOW);
    expect(snapshot.profile).toBeNull();
    expect(snapshot.training.sessions).toEqual([]);
    expect(snapshot.steps[0].total).toBe(1234);
    expect(snapshot.body.weights.map((point) => point.weightKg)).toEqual([99.9]);
  });
});

describe("AI functions use all data", () => {
  it("sends the full data context with the plan wish", async () => {
    await setAiConsent(testDb.db, annaId, true);
    const { provider, calls } = fakeProvider(() => ok({ summary: "", changes: [] }));
    await suggestPlanChanges(testDb.db, provider, annaId, "Mehr Arme", TODAY);
    const [call] = calls;
    expect(call.prompt).toContain("Weitere Daten der Person:");
    expect(call.prompt).toContain("Knie zwickt beim Treppensteigen");
    expect(call.prompt).toContain("Ellbogen zieht leicht");
    expect(call.prompt).toContain("Messwert 65.4 kg");
    expect(call.prompt).toContain("9876 Schritte");
    expect(call.prompt).not.toContain("99.9");
    expect(call.system).toContain("Weitere Daten der Person");
    expect(`${call.system}\n${call.prompt}`).not.toMatch(/anna|eddi/i);
  });

  it("adds weight history and measurements to the body fat estimate", async () => {
    await setAiConsent(testDb.db, annaId, true);
    const photoId = await uploadPhoto(testDb.db, testDb.env.UPLOADS, annaId, {
      data: PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength) as ArrayBuffer,
      contentType: "image/png",
      date: addDays(TODAY, -1),
      note: "",
      sessionId: null,
    });
    const { provider, calls } = fakeProvider(() => ok({ canEstimate: true, lowPercent: 24, highPercent: 28, note: "" }));
    await estimateBodyFat(testDb.db, testDb.env.UPLOADS, provider, annaId, photoId, TODAY, NOW);
    const [call] = calls;
    expect(call.prompt).toContain("waist: 78 cm");
    expect(call.prompt).toContain("Messwert 65.4 kg");
    expect(call.prompt).toContain(`Das Foto stammt vom ${addDays(TODAY, -1)}`);
    // Für die Schätzung zählen Körper, Ernährung und Training, nicht Schritte oder Cardio.
    expect(call.prompt).not.toContain("Schritte");
    expect(call.prompt).not.toContain("Waden fest");
  });
});

describe("AI review", () => {
  it("evaluates all data, stores the result and replaces it with the next one", async () => {
    await setAiConsent(testDb.db, annaId, true);
    const { provider, calls } = fakeProvider(() => ok(REVIEW));
    const view = await createReview(testDb.db, provider, annaId, "  Esse ich genug Eiweiß?  ", TODAY, NOW);
    expect(view).toMatchObject({ question: "Esse ich genug Eiweiß?", review: { answer: "Ja, etwas mehr Eiweiß hilft." } });

    const [call] = calls;
    expect(call.prompt).toContain('Frage der Person:\n"""Esse ich genug Eiweiß?"""');
    for (const part of ["Krafttraining", "Ernährungsziel", "Körpergewicht", "Cardio", "Mobility", "Ruhepuls", "Zyklus"]) {
      expect(call.prompt).toContain(part);
    }
    expect(`${call.system}\n${call.prompt}`).not.toMatch(/anna/i);

    const second = fakeProvider(() => ok({ ...REVIEW, answer: "Sollte ignoriert werden." }));
    await createReview(testDb.db, second.provider, annaId, "", TODAY, NOW);
    expect(second.calls[0].prompt).toContain("keine eigene Frage");
    const latest = await getLatestReview(testDb.db, annaId);
    expect(latest).toMatchObject({ question: null, review: { answer: null, summary: REVIEW.summary } });
    expect(await testDb.db.select().from(aiReview)).toHaveLength(1);
    expect(await getLatestReview(testDb.db, eddiId)).toBeNull();

    await deleteReview(testDb.db, eddiId);
    expect(await getLatestReview(testDb.db, annaId)).not.toBeNull();
    await deleteReview(testDb.db, annaId);
    expect(await getLatestReview(testDb.db, annaId)).toBeNull();
  });

  it("asks nothing without consent and stores nothing on unusable answers", async () => {
    const { provider, calls } = fakeProvider(() => ok(REVIEW));
    await expectAppError(createReview(testDb.db, provider, annaId, null, TODAY, NOW), "AI_DISABLED");
    expect(calls).toHaveLength(0);

    await setAiConsent(testDb.db, annaId, true);
    const empty = fakeProvider(() => ok({ summary: "", answer: null, areas: [], recommendations: [], dataGaps: [] }));
    await expectAppError(createReview(testDb.db, empty.provider, annaId, null, TODAY, NOW), "AI_FAILED");
    await expectAppError(createReview(testDb.db, fakeProvider(() => ({ status: "refused" })).provider, annaId, null, TODAY, NOW), "AI_REFUSED");
    expect(await getLatestReview(testDb.db, annaId)).toBeNull();
    expect((await getAiStatus(testDb.db, provider, annaId, TODAY)).usedToday).toBe(2);
  });
});
