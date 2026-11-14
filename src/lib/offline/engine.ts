/**
 * Überträgt die Offline-Warteschlange an den Server. Ohne Browser-Abhängigkeiten, damit die
 * Regeln (Reihenfolge, Wiederholen, Verwerfen) testbar sind.
 */
import {
  MAX_OPERATIONS_PER_REQUEST,
  queueKey,
  type SyncOperation,
  type SyncResult,
} from "@/domain/sync/operations";
import type { QueueStorage, QueuedOperation } from "./storage";

export interface SyncState {
  /** Vorgänge, die noch nicht übertragen sind. */
  pending: number;
  syncing: boolean;
  /** Der letzte Versuch ist gescheitert (keine Verbindung, abgemeldet oder Serverfehler). */
  failed: boolean;
  /** Vorgänge, die der Server dauerhaft abgelehnt hat (seit dem Laden der App). */
  rejected: number;
}

/** `null` = Übertragung gescheitert (kein Netz, abgemeldet, Serverfehler). */
export type SendOperations = (operations: SyncOperation[]) => Promise<SyncResult[] | null>;

/** Eingabe für einen neuen Vorgang: Kennung und Zeitpunkt vergibt die Warteschlange. */
export type NewOperation = SyncOperation extends infer Operation
  ? Operation extends SyncOperation
    ? Omit<Operation, "id" | "at">
    : never
  : never;

export interface SyncEngineOptions {
  storage: QueueStorage;
  send: SendOperations;
  newId?: () => string;
  now?: () => Date;
}

export interface SyncEngine {
  getState: () => SyncState;
  subscribe: (listener: () => void) => () => void;
  /** Legt fest, wessen Vorgänge übertragen werden. */
  setUser: (userId: string | null) => Promise<void>;
  /** `at` = Zeitpunkt des Vorgangs, falls er nicht „jetzt“ ist (z. B. nachträgliches Trainingsende). */
  enqueue: (operation: NewOperation, at?: Date) => Promise<void>;
  /** Nimmt einen noch nicht übertragenen Stand zurück (z. B. Satz vor dem Sync wieder gelöscht). */
  discard: (key: string) => Promise<void>;
  list: () => Promise<QueuedOperation[]>;
  /** Überträgt alles; `true`, wenn danach nichts mehr wartet. */
  syncNow: () => Promise<boolean>;
}

const INITIAL: SyncState = { pending: 0, syncing: false, failed: false, rejected: 0 };

export function createSyncEngine(options: SyncEngineOptions): SyncEngine {
  const { storage, send } = options;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());
  const listeners = new Set<() => void>();
  let state = INITIAL;
  let userId: string | null = null;
  let running: Promise<boolean> | null = null;
  let rerun = false;

  function update(patch: Partial<SyncState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  async function refreshPending(): Promise<number> {
    const pending = userId ? (await storage.list(userId)).length : 0;
    update({ pending });
    return pending;
  }

  async function transfer(): Promise<boolean> {
    if (!userId) return true;
    let rejected = state.rejected;
    for (;;) {
      const records = await storage.list(userId);
      if (records.length === 0) break;
      const batch = records.slice(0, MAX_OPERATIONS_PER_REQUEST);
      const results = await send(batch.map((record) => record.operation)).catch(() => null);
      if (!results) {
        update({ failed: true, pending: records.length });
        return false;
      }
      const statusById = new Map(results.map((result) => [result.id, result.status]));
      let unresolved = false;
      for (const record of batch) {
        const status = statusById.get(record.operation.id);
        if (status === "ok" || status === "duplicate" || status === "rejected") {
          await storage.removeIfUnchanged(record.key, record.operation.id);
          if (status === "rejected") rejected++;
        } else {
          unresolved = true;
        }
      }
      // Bleibt etwas offen (Serverfehler oder keine Antwort dazu), endet dieser Durchlauf:
      // Sofortiges erneutes Senden würde nur dieselben Vorgänge wiederholen.
      if (unresolved) {
        update({ failed: true, rejected, pending: (await storage.list(userId)).length });
        return false;
      }
    }
    update({ failed: false, rejected, pending: 0 });
    return true;
  }

  function syncNow(): Promise<boolean> {
    if (running) {
      rerun = true;
      return running;
    }
    update({ syncing: true });
    running = (async () => {
      try {
        let done = await transfer();
        // Kam während der Übertragung Neues dazu, gleich noch einmal.
        while (rerun) {
          rerun = false;
          done = await transfer();
        }
        return done;
      } finally {
        running = null;
        update({ syncing: false });
      }
    })();
    return running;
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setUser: async (next) => {
      userId = next;
      await refreshPending();
    },
    enqueue: async (input, at) => {
      if (!userId) return;
      const operation = { ...input, id: newId(), at: (at ?? now()).toISOString() } as SyncOperation;
      await storage.put({ key: queueKey(operation), userId, operation, createdAt: now().getTime() });
      await refreshPending();
    },
    discard: async (key) => {
      await storage.remove(key);
      await refreshPending();
    },
    list: async () => (userId ? storage.list(userId) : []),
    syncNow,
  };
}
