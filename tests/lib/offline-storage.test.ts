import { afterEach, describe, expect, it, vi } from "vitest";
import type { SyncOperation } from "@/domain/sync/operations";
import { connectIndexedDb } from "@/lib/offline/indexed-db";
import {
  createMemoryStorage,
  createResilientStorage,
  type QueueStorage,
  type QueuedOperation,
} from "@/lib/offline/storage";

const SET_A = "11111111-1111-4111-8111-111111111111";
const SET_B = "22222222-2222-4222-8222-222222222222";

function record(setId: string, operationId: string, reps: number, createdAt: number): QueuedOperation {
  const operation: SyncOperation = {
    id: operationId,
    at: "2026-11-14T10:00:00.000Z",
    type: "set.save",
    payload: { id: setId, workoutExerciseId: "we-1", position: 0, type: "work", weightKg: 60, reps, rir: 2, note: null, completed: true },
  };
  return { key: `set:${setId}`, userId: "anna", operation, createdAt };
}

const opId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Dauerhafter Speicher, der auf Wunsch scheitert (wie IndexedDB nach einem Verbindungsabbruch). */
function flakyStore() {
  const data = createMemoryStorage();
  const control = { failNext: 0, failAlways: false, connects: 0 };
  const guard = async <T>(task: () => Promise<T>): Promise<T> => {
    if (control.failAlways || control.failNext > 0) {
      control.failNext = Math.max(0, control.failNext - 1);
      throw new Error("Connection to Indexed Database server lost");
    }
    return task();
  };
  const connect = async (): Promise<QueueStorage> => {
    control.connects++;
    return {
      put: (value) => guard(() => data.put(value)),
      list: (userId) => guard(() => data.list(userId)),
      removeIfUnchanged: (key, id) => guard(() => data.removeIfUnchanged(key, id)),
      remove: (key) => guard(() => data.remove(key)),
    };
  };
  return { data, control, connect };
}

describe("offline queue storage", () => {
  it("reconnects after a single error and keeps the stored operations", async () => {
    const { data, control, connect } = flakyStore();
    const storage = createResilientStorage({ connect });
    await storage.put(record(SET_A, opId(1), 8, 1));
    control.failNext = 1;
    // Der erste Versuch scheitert, der zweite mit neuer Verbindung gelingt.
    expect(await storage.list("anna")).toHaveLength(1);
    expect(control.connects).toBe(2);
    await storage.put(record(SET_B, opId(2), 5, 2));
    expect(await data.list("anna")).toHaveLength(2);
  });

  it("keeps operations in memory while the store fails and moves them back once it works again", async () => {
    const { data, control, connect } = flakyStore();
    const storage = createResilientStorage({ connect, maxFailures: 5 });
    await storage.put(record(SET_A, opId(1), 8, 1));
    control.failAlways = true;
    await storage.put(record(SET_B, opId(2), 5, 2));
    await storage.put(record(SET_A, opId(3), 9, 3));
    // Nichts geht verloren: Der Stand im Arbeitsspeicher wird angezeigt und übertragen.
    expect((await storage.list("anna")).map((entry) => entry.operation.id)).toEqual([opId(2), opId(3)]);

    control.failAlways = false;
    expect((await storage.list("anna")).map((entry) => entry.operation.id)).toEqual([opId(2), opId(3)]);
    expect((await data.list("anna")).map((entry) => entry.operation.id)).toEqual([opId(2), opId(3)]);
  });

  it("pauses the store after repeated failures and tries again later without losing anything", async () => {
    const { data, control, connect } = flakyStore();
    let clock = 0;
    const storage = createResilientStorage({ connect, maxFailures: 2, pauseMs: 30_000, now: () => clock });
    control.failAlways = true;
    await storage.put(record(SET_A, opId(1), 8, 1));
    await storage.put(record(SET_B, opId(2), 5, 2));
    const connects = control.connects;
    expect(await storage.list("anna")).toHaveLength(2);
    // Während der Pause kein neuer Verbindungsversuch.
    expect(control.connects).toBe(connects);
    await storage.removeIfUnchanged(`set:${SET_A}`, opId(1));
    expect(await storage.list("anna")).toHaveLength(1);

    control.failAlways = false;
    clock += 30_000;
    expect(await storage.list("anna")).toHaveLength(1);
    expect((await data.list("anna")).map((entry) => entry.operation.id)).toEqual([opId(2)]);
  });

  it("does not bring back a state that was sent or discarded while the store failed", async () => {
    const { data, control, connect } = flakyStore();
    const storage = createResilientStorage({ connect, maxFailures: 10 });
    await storage.put(record(SET_A, opId(1), 8, 1));
    await storage.put(record(SET_B, opId(2), 5, 2));
    control.failAlways = true;
    // Neuer Stand von Satz A nur im Arbeitsspeicher, dann übertragen und entfernt.
    await storage.put(record(SET_A, opId(3), 9, 3));
    const [sent] = (await storage.list("anna")).filter((entry) => entry.key === `set:${SET_A}`);
    expect(sent.operation.id).toBe(opId(3));
    await storage.removeIfUnchanged(sent.key, sent.operation.id);
    await storage.remove(`set:${SET_B}`);

    control.failAlways = false;
    expect(await storage.list("anna")).toEqual([]);
    expect(await data.list("anna")).toEqual([]);
  });

  it("does not resurrect an older in-memory state over a newer stored one", async () => {
    const { control, connect } = flakyStore();
    const storage = createResilientStorage({ connect });
    control.failNext = 2;
    await storage.put(record(SET_A, opId(1), 8, 1));
    await storage.put(record(SET_A, opId(2), 9, 2));
    const [latest] = await storage.list("anna");
    expect(latest.operation.id).toBe(opId(2));
  });
});

describe("IndexedDB access", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /** Minimales IndexedDB, dessen Transaktionen abgebrochen werden (z. B. Speicher voll). */
  function abortingIndexedDb() {
    const transaction = () => {
      const tx: Record<string, unknown> & { onabort?: () => void } = { error: null };
      const request = { result: undefined, onsuccess: null };
      tx.objectStore = () => ({ get: () => request, put: () => request, delete: () => request, getAll: () => request });
      setTimeout(() => tx.onabort?.(), 0);
      return tx;
    };
    const database = { transaction, close: () => {}, onversionchange: null };
    return {
      open: () => {
        const request: { result: unknown; onsuccess?: () => void } = { result: database };
        setTimeout(() => request.onsuccess?.(), 0);
        return request;
      },
    };
  }

  it("rejects instead of hanging when a transaction is aborted", async () => {
    vi.stubGlobal("indexedDB", abortingIndexedDb());
    const store = await connectIndexedDb();
    await expect(store.removeIfUnchanged(`set:${SET_A}`, opId(1))).rejects.toThrow("aborted");
    await expect(store.put(record(SET_A, opId(1), 8, 1))).rejects.toThrow("aborted");
  });
});
