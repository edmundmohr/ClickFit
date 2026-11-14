import { describe, expect, it } from "vitest";
import {
  MAX_OPERATION_AGE_MS,
  MAX_OPERATIONS_PER_REQUEST,
  PROCESSED_RETENTION_MS,
  isExpiredOperation,
  operationTime,
  queueKey,
  syncOperationSchema,
  type SyncOperation,
  type SyncResult,
} from "@/domain/sync/operations";
import { applyPendingChanges, type ExerciseDraft } from "@/features/training/components/workout/workout-state";
import { createSyncEngine, type NewOperation } from "@/lib/offline/engine";
import { createMemoryStorage } from "@/lib/offline/storage";

const SET_A = "11111111-1111-4111-8111-111111111111";
const SET_B = "22222222-2222-4222-8222-222222222222";

const save = (setId: string, reps: number): NewOperation => ({
  type: "set.save",
  payload: { id: setId, workoutExerciseId: "we-1", position: 0, type: "work", weightKg: 60, reps, rir: 2, note: null, completed: true },
});

function engineWith(send: (operations: SyncOperation[]) => Promise<SyncResult[] | null>) {
  let counter = 0;
  let clock = Date.parse("2026-11-14T10:00:00Z");
  const storage = createMemoryStorage();
  const engine = createSyncEngine({
    storage,
    send,
    newId: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`,
    now: () => new Date((clock += 1000)),
  });
  return { engine, storage };
}

const allOk = async (operations: SyncOperation[]): Promise<SyncResult[]> =>
  operations.map((operation) => ({ id: operation.id, status: "ok" }));

describe("sync operations", () => {
  it("accepts the known operation types and rejects everything else", () => {
    const base = { id: SET_A, at: "2026-11-14T10:00:00.000Z" };
    expect(syncOperationSchema.safeParse({ ...base, ...save(SET_A, 8) }).success).toBe(true);
    expect(syncOperationSchema.safeParse({ ...base, type: "set.delete", payload: { setId: SET_B } }).success).toBe(true);
    expect(syncOperationSchema.safeParse({ ...base, type: "workout.finish", payload: { sessionId: "s1" } }).success).toBe(true);
    expect(syncOperationSchema.safeParse({ ...base, type: "user.delete", payload: {} }).success).toBe(false);
    expect(syncOperationSchema.safeParse({ ...base, type: "set.delete", payload: { setId: "x" } }).success).toBe(false);
    expect(syncOperationSchema.safeParse({ ...save(SET_A, 8), id: "nope", at: base.at }).success).toBe(false);
  });

  it("shares one queue key per set so only the latest state is kept", () => {
    const at = "2026-11-14T10:00:00.000Z";
    const saved = syncOperationSchema.parse({ id: SET_A, at, ...save(SET_A, 8) });
    const deleted = syncOperationSchema.parse({ id: SET_B, at, type: "set.delete", payload: { setId: SET_A } });
    expect(queueKey(saved)).toBe(queueKey(deleted));
    expect(queueKey(saved)).not.toBe(queueKey(syncOperationSchema.parse({ id: SET_B, at, ...save(SET_B, 8) })));
  });

  it("uses the device time unless it is in the future or invalid", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    expect(operationTime("2026-11-14T09:30:00Z", now).toISOString()).toBe("2026-11-14T09:30:00.000Z");
    expect(operationTime("2026-11-14T13:00:00Z", now)).toEqual(now);
    // Ein alter Zeitpunkt (z. B. Ende eines vor Wochen vergessenen Trainings) bleibt erhalten.
    expect(operationTime("2026-09-01T09:30:00Z", now).toISOString()).toBe("2026-09-01T09:30:00.000Z");
    expect(operationTime("garbage", now)).toEqual(now);
    // Wenige Minuten Vorlauf der Geräteuhr werden auf die Serverzeit begrenzt.
    expect(operationTime("2026-11-14T12:02:00Z", now)).toEqual(now);
  });

  it("expires old operations except finishing a workout, before the server forgets them", () => {
    const now = new Date("2026-11-14T12:00:00Z");
    const old = new Date(now.getTime() - MAX_OPERATION_AGE_MS - 60_000).toISOString();
    const recent = new Date(now.getTime() - MAX_OPERATION_AGE_MS + 60_000).toISOString();
    const saveAt = (at: string) => syncOperationSchema.parse({ id: SET_A, at, ...save(SET_A, 8) });
    expect(isExpiredOperation(saveAt(old), now)).toBe(true);
    expect(isExpiredOperation(saveAt(recent), now)).toBe(false);
    const finish = syncOperationSchema.parse({ id: SET_B, at: old, type: "workout.finish", payload: { sessionId: "s1" } });
    expect(isExpiredOperation(finish, now)).toBe(false);
    // Merker bleiben länger als die Annahmefrist plus Uhrtoleranz.
    expect(PROCESSED_RETENTION_MS).toBeGreaterThan(MAX_OPERATION_AGE_MS + 60 * 60_000);
  });
});

describe("offline queue", () => {
  it("does nothing without a user", async () => {
    const { engine } = engineWith(allOk);
    await engine.enqueue(save(SET_A, 8));
    expect(engine.getState().pending).toBe(0);
    expect(await engine.syncNow()).toBe(true);
  });

  it("keeps only the latest state of a set and sends in order of entry", async () => {
    const sent: SyncOperation[][] = [];
    const { engine } = engineWith(async (operations) => {
      sent.push(operations);
      return allOk(operations);
    });
    await engine.setUser("anna");
    await engine.enqueue(save(SET_A, 8));
    await engine.enqueue(save(SET_B, 5));
    await engine.enqueue(save(SET_A, 10));
    expect(engine.getState().pending).toBe(2);

    expect(await engine.syncNow()).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0].map((operation) => (operation.type === "set.save" ? operation.payload.reps : null))).toEqual([5, 10]);
    expect(engine.getState()).toMatchObject({ pending: 0, failed: false, syncing: false });
  });

  it("keeps everything when the transfer fails and retries later", async () => {
    let online = false;
    const { engine } = engineWith(async (operations) => (online ? allOk(operations) : null));
    await engine.setUser("anna");
    await engine.enqueue(save(SET_A, 8));
    expect(await engine.syncNow()).toBe(false);
    expect(engine.getState()).toMatchObject({ pending: 1, failed: true });
    online = true;
    expect(await engine.syncNow()).toBe(true);
    expect(engine.getState()).toMatchObject({ pending: 0, failed: false });
  });

  it("treats a thrown network error like a failed transfer", async () => {
    const { engine } = engineWith(async () => {
      throw new TypeError("Failed to fetch");
    });
    await engine.setUser("anna");
    await engine.enqueue(save(SET_A, 8));
    expect(await engine.syncNow()).toBe(false);
    expect(engine.getState().pending).toBe(1);
  });

  it("drops rejected operations, counts them and keeps the ones to retry", async () => {
    const { engine } = engineWith(async (operations) =>
      operations.map((operation, index) => ({ id: operation.id, status: index === 0 ? "rejected" : "retry" })),
    );
    await engine.setUser("anna");
    await engine.enqueue(save(SET_A, 8));
    await engine.enqueue(save(SET_B, 8));
    expect(await engine.syncNow()).toBe(false);
    expect(engine.getState()).toMatchObject({ pending: 1, rejected: 1, failed: true });
  });

  it("does not lose a change made while the previous state was on its way", async () => {
    const gate = { release: () => {} };
    const sent: number[] = [];
    const { engine } = engineWith(async (operations) => {
      for (const operation of operations) if (operation.type === "set.save") sent.push(operation.payload.reps ?? -1);
      if (sent.length === 1) await new Promise<void>((resolve) => (gate.release = resolve));
      return allOk(operations);
    });
    await engine.setUser("anna");
    await engine.enqueue(save(SET_A, 8));
    const first = engine.syncNow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await engine.enqueue(save(SET_A, 9));
    const second = engine.syncNow();
    gate.release();
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(sent).toEqual([8, 9]);
    expect(engine.getState().pending).toBe(0);
  });

  it("never sends the operations of another user", async () => {
    const sent: SyncOperation[] = [];
    const { engine } = engineWith(async (operations) => {
      sent.push(...operations);
      return allOk(operations);
    });
    await engine.setUser("anna");
    await engine.enqueue(save(SET_A, 8));
    await engine.setUser("eddi");
    expect(engine.getState().pending).toBe(0);
    expect(await engine.syncNow()).toBe(true);
    expect(sent).toHaveLength(0);
    await engine.setUser("anna");
    expect(engine.getState().pending).toBe(1);
  });

  it("splits a long queue into several requests", async () => {
    const sizes: number[] = [];
    const { engine } = engineWith(async (operations) => {
      sizes.push(operations.length);
      return allOk(operations);
    });
    await engine.setUser("anna");
    for (let index = 0; index < MAX_OPERATIONS_PER_REQUEST + 5; index++) {
      await engine.enqueue(save(`${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`, index));
    }
    expect(await engine.syncNow()).toBe(true);
    expect(sizes).toEqual([MAX_OPERATIONS_PER_REQUEST, 5]);
  });

  it("can take back a state that was never sent", async () => {
    const { engine } = engineWith(allOk);
    await engine.setUser("anna");
    await engine.enqueue(save(SET_A, 8));
    await engine.discard(`set:${SET_A}`);
    expect(engine.getState().pending).toBe(0);
  });
});

describe("restoring pending changes in the workout", () => {
  const exercise = (unit: "kg" | "lbs"): ExerciseDraft => ({
    id: "we-1",
    exerciseId: "barbell-bench-press",
    name: "Bankdrücken",
    type: "weight_reps",
    repMin: 6,
    repMax: 10,
    targetRir: 2,
    restSeconds: 150,
    groupId: null,
    unit,
    incrementKg: 2.5,
    bar: null,
    note: "",
    cues: [],
    mistakes: [],
    previous: null,
    bests: null,
    feedback: null,
    sets: [
      { id: SET_A, type: "work", weightText: "", repsText: "", rir: null, note: "", completed: false },
      { id: SET_B, type: "work", weightText: "", repsText: "", rir: null, note: "", completed: false },
    ],
  });
  const payload = (id: string, position: number, weightKg: number) => ({
    id,
    workoutExerciseId: "we-1",
    position,
    type: "work" as const,
    weightKg,
    reps: 8,
    rir: 1,
    note: null,
    completed: true,
  });

  it("overlays saved sets, adds new ones and removes deleted ones", () => {
    const added = "33333333-3333-4333-8333-333333333333";
    const [result] = applyPendingChanges([exercise("kg")], {
      saves: [payload(SET_A, 0, 62.5), payload(added, 2, 50)],
      deletedSetIds: [SET_B],
    });
    expect(result.sets.map((set) => set.id)).toEqual([SET_A, added]);
    expect(result.sets[0]).toMatchObject({ weightText: "62,5", repsText: "8", rir: 1, completed: true });
  });

  it("shows the weight in the unit of the exercise", () => {
    const [result] = applyPendingChanges([exercise("lbs")], { saves: [payload(SET_A, 0, 45.359237)], deletedSetIds: [] });
    expect(result.sets[0].weightText).toBe("100");
  });

  it("ignores changes of other exercises", () => {
    const other = { ...payload(SET_A, 0, 70), workoutExerciseId: "we-2" };
    const [result] = applyPendingChanges([exercise("kg")], { saves: [other], deletedSetIds: [] });
    expect(result.sets[0].completed).toBe(false);
  });
});
