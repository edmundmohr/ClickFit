import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { pushSubscription, restTimer, syncOperation, workoutSession } from "@/db/schema";
import { EQUIPMENT } from "@/domain/exercises/types";
import type { SyncOperation } from "@/domain/sync/operations";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import {
  MAX_SUBSCRIPTIONS_PER_USER,
  cancelRestTimer,
  countSubscriptions,
  deleteSubscription,
  deliverRestTimer,
  saveSubscription,
  scheduleRestTimer,
  type RestTimerMessage,
} from "@/features/notifications/services/push-service";
import { processOperations, pruneProcessedOperations } from "@/features/sync/services/sync-service";
import type { OnboardingInput } from "@/features/training/schemas";
import { createPlanFromProfile, getActivePlan } from "@/features/training/services/plan-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { startWorkout } from "@/features/training/services/workout-service";
import { getWorkoutView, type WorkoutView } from "@/features/training/services/workout-view";
import { AppError } from "@/lib/errors";
import { toLocalDate } from "@/lib/dates";
import { generateVapidKeys } from "@/lib/push/vapid";
import { handleRestTimerBatch } from "@/server/rest-timer-consumer";
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
let sessionId: string;
let view: WorkoutView;
let opCounter = 0;

/** Neue, gültige Vorgangs-Kennung. */
function opId(): string {
  return `00000000-0000-4000-8000-${String(++opCounter).padStart(12, "0")}`;
}

function saveOp(setIndex: number, reps: number, at = NOW): SyncOperation {
  const exercise = view.exercises[0];
  return {
    id: opId(),
    at: at.toISOString(),
    type: "set.save",
    payload: {
      id: exercise.sets[setIndex].id,
      workoutExerciseId: exercise.id,
      position: setIndex,
      type: "work",
      weightKg: 60,
      reps,
      rir: 2,
      note: null,
      completed: true,
    },
  };
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
  const plan = await getActivePlan(db, annaId, TODAY);
  sessionId = await startWorkout(db, annaId, plan!.days[0].id, NOW);
  view = await getWorkoutView(db, annaId, sessionId);
});

describe("offline sync", () => {
  it("applies queued operations in order with the time of the device", async () => {
    const doneAt = new Date(NOW.getTime() + 5 * 60_000);
    const serverNow = new Date(NOW.getTime() + 2 * 60 * 60_000);
    const finish: SyncOperation = { id: opId(), at: new Date(NOW.getTime() + 50 * 60_000).toISOString(), type: "workout.finish", payload: { sessionId } };
    const note: SyncOperation = { id: opId(), at: NOW.toISOString(), type: "workout.note", payload: { sessionId, note: " Gute Einheit " } };
    const results = await processOperations(testDb.db, annaId, [saveOp(0, 8, doneAt), saveOp(1, 7, doneAt), note, finish], serverNow);
    expect(results.map((result) => result.status)).toEqual(["ok", "ok", "ok", "ok"]);

    const after = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(after.status).toBe("completed");
    expect(after.note).toBe("Gute Einheit");
    expect(after.exercises[0].sets.slice(0, 2).map((set) => set.reps)).toEqual([8, 7]);
    // Abgehakt und beendet wurde zur Zeit auf dem Gerät, nicht erst beim Übertragen.
    expect(after.exercises[0].sets[0].completedAt).toBe(doneAt.toISOString());
    expect(after.finishedAt).toBe(finish.at);
  });

  it("applies an operation only once", async () => {
    const operation = saveOp(0, 8);
    expect((await processOperations(testDb.db, annaId, [operation], NOW))[0].status).toBe("ok");
    // Zwischenzeitlich am Server geändert: Ein erneut gesendeter alter Vorgang darf das nicht überschreiben.
    await processOperations(testDb.db, annaId, [saveOp(0, 12)], NOW);
    expect((await processOperations(testDb.db, annaId, [operation], NOW))[0].status).toBe("duplicate");
    expect((await getWorkoutView(testDb.db, annaId, sessionId)).exercises[0].sets[0].reps).toBe(12);
  });

  it("rejects operations on data of another user without touching it", async () => {
    const results = await processOperations(
      testDb.db,
      eddiId,
      [
        saveOp(0, 99),
        { id: opId(), at: NOW.toISOString(), type: "set.delete", payload: { setId: view.exercises[0].sets[1].id } },
        { id: opId(), at: NOW.toISOString(), type: "workout.finish", payload: { sessionId } },
        { id: opId(), at: NOW.toISOString(), type: "workout.note", payload: { sessionId, note: "fremd" } },
      ],
      NOW,
    );
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected", "rejected", "rejected"]);
    const after = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(after).toMatchObject({ status: "in_progress", note: "" });
    expect(after.exercises[0].sets).toHaveLength(view.exercises[0].sets.length);
    expect(after.exercises[0].sets[0].reps).toBeNull();
  });

  it("rejects malformed operations and still processes the valid ones", async () => {
    const results = await processOperations(
      testDb.db,
      annaId,
      [{ id: "kaputt", type: "set.save" }, null, { ...saveOp(0, 8), type: "user.delete" }, saveOp(1, 6)],
      NOW,
    );
    expect(results.map((result) => result.status)).toEqual(["rejected", "rejected", "rejected", "ok"]);
    expect(results[0].id).toBe("kaputt");
    expect((await getWorkoutView(testDb.db, annaId, sessionId)).exercises[0].sets[1].reps).toBe(6);
  });

  it("deletes a set and tolerates deleting it twice", async () => {
    const setId = view.exercises[0].sets[0].id;
    const remove = (): SyncOperation => ({ id: opId(), at: NOW.toISOString(), type: "set.delete", payload: { setId } });
    expect((await processOperations(testDb.db, annaId, [remove(), remove()], NOW)).map((result) => result.status)).toEqual(["ok", "ok"]);
    const after = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(after.exercises[0].sets.some((set) => set.id === setId)).toBe(false);
  });

  it("can add a set that was created offline", async () => {
    const exercise = view.exercises[0];
    const added: SyncOperation = {
      id: opId(),
      at: NOW.toISOString(),
      type: "set.save",
      payload: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", workoutExerciseId: exercise.id, position: exercise.sets.length, type: "drop", weightKg: 40, reps: 12, rir: 0, note: "leer", completed: true },
    };
    expect((await processOperations(testDb.db, annaId, [added], NOW))[0].status).toBe("ok");
    const after = await getWorkoutView(testDb.db, annaId, sessionId);
    expect(after.exercises[0].sets.at(-1)).toMatchObject({ type: "drop", weightKg: 40, reps: 12, note: "leer" });
  });

  it("rejects operations after the workout was deleted", async () => {
    await testDb.db.delete(workoutSession).where(eq(workoutSession.id, sessionId));
    expect((await processOperations(testDb.db, annaId, [saveOp(0, 8)], NOW))[0].status).toBe("rejected");
  });

  it("forgets processed operations only after they can no longer come back", async () => {
    await processOperations(testDb.db, annaId, [saveOp(0, 8)], NOW);
    await pruneProcessedOperations(testDb.db, new Date(NOW.getTime() + 7 * 86_400_000));
    expect(await testDb.db.select().from(syncOperation)).toHaveLength(1);
    await pruneProcessedOperations(testDb.db, new Date(NOW.getTime() + 60 * 86_400_000));
    expect(await testDb.db.select().from(syncOperation)).toHaveLength(0);
  });
});

describe("push subscriptions and rest timer", () => {
  const endpoint = (name: string) => `https://web.push.apple.com/${name}`;
  const subscription = (name: string) => ({ endpoint: endpoint(name), p256dh: "p256dh-key-value", auth: "auth-key-value" });

  function fakeQueue() {
    const sent: { message: RestTimerMessage; delaySeconds: number }[] = [];
    return {
      sent,
      queue: {
        send: async (message: RestTimerMessage, options: { delaySeconds: number }) => {
          sent.push({ message, delaySeconds: options.delaySeconds });
        },
      },
    };
  }

  function fakeFetch(status: number | ((url: string) => number)) {
    const calls: string[] = [];
    const fetcher = (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      return new Response(null, { status: typeof status === "number" ? status : status(String(url)) });
    }) as typeof fetch;
    return { calls, fetcher };
  }

  it("stores one subscription per device and moves it when another user signs in", async () => {
    await saveSubscription(testDb.db, annaId, subscription("phone"));
    await saveSubscription(testDb.db, annaId, subscription("phone"));
    expect(await countSubscriptions(testDb.db, annaId)).toBe(1);
    await saveSubscription(testDb.db, eddiId, subscription("phone"));
    expect(await countSubscriptions(testDb.db, annaId)).toBe(0);
    expect(await countSubscriptions(testDb.db, eddiId)).toBe(1);
    // Fremde Abos lassen sich nicht löschen.
    await deleteSubscription(testDb.db, annaId, endpoint("phone"));
    expect(await countSubscriptions(testDb.db, eddiId)).toBe(1);
    await deleteSubscription(testDb.db, eddiId, endpoint("phone"));
    expect(await countSubscriptions(testDb.db, eddiId)).toBe(0);
  });

  it("refuses endpoints that are not a browser push service", async () => {
    const error: unknown = await saveSubscription(testDb.db, annaId, { ...subscription("x"), endpoint: "https://evil.example/hook" }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(AppError);
    expect(await countSubscriptions(testDb.db, annaId)).toBe(0);
  });

  it("keeps only the newest devices", async () => {
    for (let index = 0; index < MAX_SUBSCRIPTIONS_PER_USER + 2; index++) {
      await saveSubscription(testDb.db, annaId, subscription(`device-${index}`), new Date(NOW.getTime() + index * 1000));
    }
    const rows = await testDb.db.select().from(pushSubscription).where(eq(pushSubscription.userId, annaId));
    expect(rows).toHaveLength(MAX_SUBSCRIPTIONS_PER_USER);
    expect(rows.some((row) => row.endpoint === endpoint("device-0"))).toBe(false);
  });

  it("schedules the push with the remaining rest as delay", async () => {
    const { queue, sent } = fakeQueue();
    await scheduleRestTimer(testDb.db, queue, annaId, new Date(NOW.getTime() + 89_500), NOW);
    expect(sent).toHaveLength(1);
    expect(sent[0].delaySeconds).toBe(90);
    const [row] = await testDb.db.select().from(restTimer);
    expect(row).toMatchObject({ userId: annaId, token: sent[0].message.token });

    const tooLong = scheduleRestTimer(testDb.db, queue, annaId, new Date(NOW.getTime() + 3 * 60 * 60_000), NOW);
    await expect(tooLong).rejects.toBeInstanceOf(AppError);
    await expect(scheduleRestTimer(testDb.db, queue, annaId, new Date(NOW.getTime() - 10_000), NOW)).rejects.toBeInstanceOf(AppError);
  });

  it("sends the push once, to every device, and removes dead subscriptions", async () => {
    const keys = await generateVapidKeys();
    const { queue, sent } = fakeQueue();
    await saveSubscription(testDb.db, annaId, subscription("phone"));
    await saveSubscription(testDb.db, annaId, subscription("old-phone"));
    await saveSubscription(testDb.db, eddiId, subscription("eddi"));
    await scheduleRestTimer(testDb.db, queue, annaId, new Date(NOW.getTime() + 60_000), NOW);

    const { calls, fetcher } = fakeFetch((url) => (url.endsWith("old-phone") ? 410 : 201));
    const config = { keys, subject: "https://clickfit.online", fetcher };
    expect(await deliverRestTimer(testDb.db, sent[0].message, config)).toBe("sent");
    expect(calls.sort()).toEqual([endpoint("old-phone"), endpoint("phone")]);
    expect(await countSubscriptions(testDb.db, annaId)).toBe(1);
    // Dieselbe Nachricht ein zweites Mal (Queue liefert mindestens einmal): kein zweiter Push.
    expect(await deliverRestTimer(testDb.db, sent[0].message, config)).toBe("stale");
    expect(calls).toHaveLength(2);
  });

  it("stays silent when the rest was cancelled or replaced", async () => {
    const keys = await generateVapidKeys();
    const { queue, sent } = fakeQueue();
    const { calls, fetcher } = fakeFetch(201);
    const config = { keys, subject: "https://clickfit.online", fetcher };
    await saveSubscription(testDb.db, annaId, subscription("phone"));

    await scheduleRestTimer(testDb.db, queue, annaId, new Date(NOW.getTime() + 60_000), NOW);
    await cancelRestTimer(testDb.db, annaId);
    expect(await deliverRestTimer(testDb.db, sent[0].message, config)).toBe("stale");

    await scheduleRestTimer(testDb.db, queue, annaId, new Date(NOW.getTime() + 60_000), NOW);
    await scheduleRestTimer(testDb.db, queue, annaId, new Date(NOW.getTime() + 75_000), NOW);
    expect(await deliverRestTimer(testDb.db, sent[1].message, config)).toBe("stale");
    expect(calls).toHaveLength(0);
    expect(await deliverRestTimer(testDb.db, sent[2].message, config)).toBe("sent");
    expect(calls).toHaveLength(1);
  });

  it("acknowledges queue messages in the worker and skips sending without keys", async () => {
    const { queue, sent } = fakeQueue();
    await scheduleRestTimer(testDb.db, queue, annaId, new Date(NOW.getTime() + 60_000), NOW);
    const acked: string[] = [];
    const batch = {
      queue: "clickfit-rest-timer",
      messages: [
        { id: "m1", timestamp: NOW, attempts: 1, body: sent[0].message, ack: () => acked.push("ack"), retry: () => acked.push("retry") },
      ],
      ackAll: () => acked.push("ackAll"),
      retryAll: () => acked.push("retryAll"),
    } as unknown as MessageBatch<RestTimerMessage>;

    await handleRestTimerBatch(batch, { DB: testDb.env.DB, APP_URL: "https://clickfit.online" });
    expect(acked).toEqual(["ackAll"]);
    expect(await testDb.db.select().from(restTimer)).toHaveLength(1);

    const keys = await generateVapidKeys();
    await handleRestTimerBatch(batch, {
      DB: testDb.env.DB,
      APP_URL: "https://clickfit.online",
      VAPID_PUBLIC_KEY: keys.publicKey,
      VAPID_PRIVATE_KEY: keys.privateKey,
    });
    expect(acked).toEqual(["ackAll", "ack"]);
    expect(await testDb.db.select().from(restTimer)).toHaveLength(0);
  });
});
