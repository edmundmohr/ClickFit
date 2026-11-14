import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import { bodyFatEstimate } from "@/db/schema";
import type { RawPlanChange } from "@/domain/ai/plan-changes";
import { EQUIPMENT } from "@/domain/exercises/types";
import {
  AI_DAILY_LIMIT,
  claimAiRequest,
  getAiStatus,
  hasAiConsent,
  setAiConsent,
} from "@/features/ai/services/ai-service";
import {
  deleteBodyFatEstimate,
  estimateBodyFat,
  listBodyFatEstimates,
} from "@/features/ai/services/body-fat-service";
import { applyPlanSuggestions, suggestPlanChanges } from "@/features/ai/services/plan-refinement";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import { deletePhoto, uploadPhoto } from "@/features/progress/services/photo-service";
import type { OnboardingInput } from "@/features/training/schemas";
import { createPlanFromProfile, listFolders } from "@/features/training/services/plan-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { AppError } from "@/lib/errors";
import { toLocalDate } from "@/lib/dates";
import type { LlmProvider, LlmRequest, LlmResult } from "@/lib/llm";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const NOW = new Date("2026-11-16T17:00:00Z");
const TODAY = toLocalDate(NOW);

const onboarding: OnboardingInput = {
  goal: "muscle_gain",
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
  injuryNote: "",
  excludedExerciseIds: [],
};

type AnyRequest = LlmRequest<z.ZodType>;

/** Nachgebauter Anbieter: zeichnet Anfragen auf und antwortet mit dem vorgegebenen Ergebnis. */
function fakeProvider(reply: (request: AnyRequest) => LlmResult<unknown>) {
  const calls: AnyRequest[] = [];
  const provider: LlmProvider = {
    name: "Testanbieter",
    model: "test-model",
    generate: async (request) => {
      calls.push(request);
      const result = reply(request);
      // Wie der echte Anbieter: Die Antwort muss zum Schema passen.
      if (result.status === "ok") return { ...result, data: request.schema.parse(result.data) } as never;
      return result as never;
    },
  };
  return { provider, calls };
}

const ok = (data: unknown): LlmResult<unknown> => ({ status: "ok", data, model: "test-model" });

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

/** Kleinstes gültiges PNG (1 × 1 Pixel). */
const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (char) => char.charCodeAt(0),
);

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
});

describe("AI consent and daily limit", () => {
  it("is off until the user agrees and can be switched off again", async () => {
    const { provider } = fakeProvider(() => ok({}));
    expect(await getAiStatus(testDb.db, provider, annaId, TODAY)).toMatchObject({ available: true, enabled: false, usedToday: 0, provider: "Testanbieter" });
    expect(await getAiStatus(testDb.db, null, annaId, TODAY)).toMatchObject({ available: false, provider: null });
    await setAiConsent(testDb.db, annaId, true);
    await setAiConsent(testDb.db, annaId, true);
    expect(await hasAiConsent(testDb.db, annaId)).toBe(true);
    expect(await hasAiConsent(testDb.db, eddiId)).toBe(false);
    await setAiConsent(testDb.db, annaId, false);
    expect(await hasAiConsent(testDb.db, annaId)).toBe(false);
  });

  it("refuses without provider, without consent and above the daily limit", async () => {
    const { provider } = fakeProvider(() => ok({}));
    await expectAppError(claimAiRequest(testDb.db, null, annaId, TODAY), "AI_UNAVAILABLE");
    await expectAppError(claimAiRequest(testDb.db, provider, annaId, TODAY), "AI_DISABLED");
    expect((await getAiStatus(testDb.db, provider, annaId, TODAY)).usedToday).toBe(0);

    await setAiConsent(testDb.db, annaId, true);
    for (let index = 0; index < AI_DAILY_LIMIT; index++) await claimAiRequest(testDb.db, provider, annaId, TODAY);
    await expectAppError(claimAiRequest(testDb.db, provider, annaId, TODAY), "AI_LIMIT");
    // Am nächsten Tag und für andere Nutzer zählt es neu.
    await claimAiRequest(testDb.db, provider, annaId, "2026-11-17");
    await setAiConsent(testDb.db, eddiId, true);
    await claimAiRequest(testDb.db, provider, eddiId, TODAY);
    expect((await getAiStatus(testDb.db, provider, eddiId, TODAY)).usedToday).toBe(1);
  });
});

describe("plan refinement", () => {
  async function firstDay() {
    const [plan] = await listFolders(testDb.db, annaId);
    return { plan, day: plan.days[0] };
  }

  it("sends training data without the name and returns only valid suggestions", async () => {
    await setAiConsent(testDb.db, annaId, true);
    const { day } = await firstDay();
    const [first, second] = day.exercises;
    const { provider, calls } = fakeProvider(() =>
      ok({
        summary: " Mehr Schulter. ",
        changes: [
          { dayId: day.id, action: "adjust", exerciseId: first.exercise.id, newExerciseId: null, sets: 4, repMin: null, repMax: null, reason: "Mehr Volumen." },
          { dayId: day.id, action: "replace", exerciseId: second.exercise.id, newExerciseId: "barbell-bench-press", sets: null, repMin: null, repMax: null, reason: "Braucht eine Langhantel." },
          { dayId: day.id, action: "add", exerciseId: "erfundene-uebung", newExerciseId: null, sets: 3, repMin: 8, repMax: 12, reason: "Gibt es nicht." },
          { dayId: "fremder-tag", action: "remove", exerciseId: first.exercise.id, newExerciseId: null, sets: null, repMin: null, repMax: null, reason: "Falscher Tag." },
        ],
      }),
    );

    const result = await suggestPlanChanges(testDb.db, provider, annaId, "  Mehr Fokus auf Schultern  ", TODAY);
    expect(result.summary).toBe("Mehr Schulter.");
    // Übrig bleibt nur, was zum Plan und zum Equipment passt (keine Langhantel zu Hause).
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ action: "adjust", sets: 4, exerciseName: first.exercise.name });

    const [call] = calls;
    expect(call.effort).toBe("medium");
    expect(call.prompt).toContain("Mehr Fokus auf Schultern");
    expect(call.prompt).toContain(first.exercise.id);
    expect(call.prompt).toContain("knee");
    expect(call.prompt).not.toContain("barbell-bench-press");
    // Übungen, die wegen der Beschwerden gemieden werden, stehen nicht zur Auswahl.
    expect(call.prompt).not.toContain("leg-extension");
    expect(`${call.system}\n${call.prompt}`).not.toMatch(/anna/i);
    expect((await getAiStatus(testDb.db, provider, annaId, TODAY)).usedToday).toBe(1);
  });

  it("does not contact the provider without consent or without a plan", async () => {
    const { provider, calls } = fakeProvider(() => ok({ summary: "", changes: [] }));
    await expectAppError(suggestPlanChanges(testDb.db, provider, annaId, "Mehr Schultern", TODAY), "AI_DISABLED");
    await setAiConsent(testDb.db, eddiId, true);
    await expectAppError(suggestPlanChanges(testDb.db, provider, eddiId, "Mehr Schultern", TODAY), "PROFILE_REQUIRED");
    expect(calls).toHaveLength(0);
    expect((await getAiStatus(testDb.db, provider, eddiId, TODAY)).usedToday).toBe(0);
  });

  it("maps refusals and failures of the provider to errors", async () => {
    await setAiConsent(testDb.db, annaId, true);
    await expectAppError(suggestPlanChanges(testDb.db, fakeProvider(() => ({ status: "refused" })).provider, annaId, "Wunsch", TODAY), "AI_REFUSED");
    await expectAppError(suggestPlanChanges(testDb.db, fakeProvider(() => ({ status: "failed" })).provider, annaId, "Wunsch", TODAY), "AI_FAILED");
    await expectAppError(suggestPlanChanges(testDb.db, fakeProvider(() => ({ status: "unavailable" })).provider, annaId, "Wunsch", TODAY), "AI_UNAVAILABLE");
  });

  it("applies selected changes and re-checks what the device sends back", async () => {
    const { day } = await firstDay();
    const [first, second] = day.exercises;
    const selected: RawPlanChange[] = [
      { dayId: day.id, action: "adjust", exerciseId: first.exercise.id, newExerciseId: null, sets: 5, repMin: 8, repMax: 12, reason: "" },
      { dayId: day.id, action: "remove", exerciseId: second.exercise.id, newExerciseId: null, sets: null, repMin: null, repMax: null, reason: "" },
      // Manipuliert: Diese Übung ist am Ort nicht möglich und darf nicht in den Plan kommen.
      { dayId: day.id, action: "add", exerciseId: "barbell-bench-press", newExerciseId: null, sets: 3, repMin: 8, repMax: 12, reason: "" },
    ];
    expect(await applyPlanSuggestions(testDb.db, annaId, selected, TODAY)).toBe(2);

    const after = (await firstDay()).day;
    expect(after.exercises.map((entry) => entry.exercise.id)).toEqual(
      day.exercises.filter((entry) => entry.exercise.id !== second.exercise.id).map((entry) => entry.exercise.id),
    );
    expect(after.exercises[0]).toMatchObject({ sets: 5, repMin: 8, repMax: 12, restSeconds: first.restSeconds });
    expect(after).toMatchObject({ weekday: day.weekday, focus: day.focus });
    // Die anderen Tage bleiben unverändert.
    const [plan] = await listFolders(testDb.db, annaId);
    expect(plan.days).toHaveLength(3);
  });

  it("cannot touch the plan of another user", async () => {
    const { day } = await firstDay();
    await saveOnboarding(testDb.db, eddiId, onboarding);
    await createPlanFromProfile(testDb.db, eddiId, TODAY, NOW);
    const foreign: RawPlanChange[] = [
      { dayId: day.id, action: "remove", exerciseId: day.exercises[0].exercise.id, newExerciseId: null, sets: null, repMin: null, repMax: null, reason: "" },
    ];
    expect(await applyPlanSuggestions(testDb.db, eddiId, foreign, TODAY)).toBe(0);
    expect((await firstDay()).day.exercises).toHaveLength(day.exercises.length);
  });
});

describe("body fat estimate", () => {
  async function addPhoto(userId: string): Promise<string> {
    return uploadPhoto(testDb.db, testDb.env.UPLOADS, userId, {
      data: PNG.buffer.slice(PNG.byteOffset, PNG.byteOffset + PNG.byteLength) as ArrayBuffer,
      contentType: "image/png",
      date: "2026-11-10",
      note: "",
      sessionId: null,
    });
  }

  it("sends the photo with a few body facts and stores the range as an estimate", async () => {
    await setAiConsent(testDb.db, annaId, true);
    const photoId = await addPhoto(annaId);
    const { provider, calls } = fakeProvider(() => ok({ canEstimate: true, lowPercent: 21.4, highPercent: 25.8, note: "Bauch und Arme gut sichtbar." }));

    const outcome = await estimateBodyFat(testDb.db, testDb.env.UPLOADS, provider, annaId, photoId, TODAY, NOW);
    expect(outcome).toMatchObject({ status: "estimated", estimate: { photoId, date: "2026-11-10", lowPercent: 21, highPercent: 26 } });

    const [call] = calls;
    expect(call.images).toHaveLength(1);
    expect(call.images?.[0].mediaType).toBe("image/png");
    expect(atob(call.images?.[0].base64 ?? "").length).toBe(PNG.byteLength);
    expect(call.prompt).toContain("weiblich");
    expect(call.prompt).toContain("170 cm");
    expect(call.prompt).toContain("34 Jahre");
    expect(`${call.system}\n${call.prompt}`).not.toMatch(/anna/i);

    const [stored] = await testDb.db.select().from(bodyFatEstimate);
    expect(stored).toMatchObject({ userId: annaId, photoId, model: "test-model", note: "Bauch und Arme gut sichtbar." });
    expect(await listBodyFatEstimates(testDb.db, eddiId)).toEqual([]);
  });

  it("keeps one estimate per photo", async () => {
    await setAiConsent(testDb.db, annaId, true);
    const photoId = await addPhoto(annaId);
    const first = fakeProvider(() => ok({ canEstimate: true, lowPercent: 20, highPercent: 25, note: "" }));
    const second = fakeProvider(() => ok({ canEstimate: true, lowPercent: 18, highPercent: 22, note: "" }));
    await estimateBodyFat(testDb.db, testDb.env.UPLOADS, first.provider, annaId, photoId, TODAY);
    await estimateBodyFat(testDb.db, testDb.env.UPLOADS, second.provider, annaId, photoId, TODAY);
    const estimates = await listBodyFatEstimates(testDb.db, annaId);
    expect(estimates).toHaveLength(1);
    expect(estimates[0]).toMatchObject({ lowPercent: 18, highPercent: 22, note: null });
  });

  it("stores nothing when the photo is not usable or the answer is implausible", async () => {
    await setAiConsent(testDb.db, annaId, true);
    const photoId = await addPhoto(annaId);
    const unusable = fakeProvider(() => ok({ canEstimate: false, lowPercent: null, highPercent: null, note: "Auf dem Foto ist kein Körper zu sehen." }));
    expect(await estimateBodyFat(testDb.db, testDb.env.UPLOADS, unusable.provider, annaId, photoId, TODAY)).toEqual({
      status: "not_possible",
      note: "Auf dem Foto ist kein Körper zu sehen.",
    });
    const absurd = fakeProvider(() => ok({ canEstimate: true, lowPercent: 5, highPercent: 55, note: "?" }));
    expect((await estimateBodyFat(testDb.db, testDb.env.UPLOADS, absurd.provider, annaId, photoId, TODAY)).status).toBe("not_possible");
    await expectAppError(
      estimateBodyFat(testDb.db, testDb.env.UPLOADS, fakeProvider(() => ({ status: "refused" })).provider, annaId, photoId, TODAY),
      "AI_REFUSED",
    );
    expect(await listBodyFatEstimates(testDb.db, annaId)).toEqual([]);
  });

  it("never sends a photo of another user or without consent", async () => {
    const photoId = await addPhoto(annaId);
    const { provider, calls } = fakeProvider(() => ok({ canEstimate: true, lowPercent: 20, highPercent: 25, note: "" }));
    await expectAppError(estimateBodyFat(testDb.db, testDb.env.UPLOADS, provider, annaId, photoId, TODAY), "AI_DISABLED");
    await setAiConsent(testDb.db, eddiId, true);
    await expectAppError(estimateBodyFat(testDb.db, testDb.env.UPLOADS, provider, eddiId, photoId, TODAY), "NOT_FOUND");
    await expectAppError(estimateBodyFat(testDb.db, testDb.env.UPLOADS, null, annaId, photoId, TODAY), "AI_UNAVAILABLE");
    expect(calls).toHaveLength(0);
    expect((await getAiStatus(testDb.db, provider, eddiId, TODAY)).usedToday).toBe(0);
  });

  it("deletes own estimates only and removes them with the photo", async () => {
    await setAiConsent(testDb.db, annaId, true);
    const photoId = await addPhoto(annaId);
    const { provider } = fakeProvider(() => ok({ canEstimate: true, lowPercent: 20, highPercent: 25, note: "" }));
    const outcome = await estimateBodyFat(testDb.db, testDb.env.UPLOADS, provider, annaId, photoId, TODAY);
    if (outcome.status !== "estimated") throw new Error("expected an estimate");
    await expectAppError(deleteBodyFatEstimate(testDb.db, eddiId, outcome.estimate.id), "NOT_FOUND");
    expect(await listBodyFatEstimates(testDb.db, annaId)).toHaveLength(1);

    await deletePhoto(testDb.db, testDb.env.UPLOADS, annaId, photoId);
    expect(await listBodyFatEstimates(testDb.db, annaId)).toEqual([]);

    const other = await addPhoto(annaId);
    const again = await estimateBodyFat(testDb.db, testDb.env.UPLOADS, provider, annaId, other, TODAY);
    if (again.status !== "estimated") throw new Error("expected an estimate");
    await deleteBodyFatEstimate(testDb.db, annaId, again.estimate.id);
    expect(await listBodyFatEstimates(testDb.db, annaId)).toEqual([]);
  });
});
