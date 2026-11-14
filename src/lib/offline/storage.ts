/**
 * Speicher der Offline-Warteschlange. Im Browser liegt sie in IndexedDB und übersteht damit
 * das Schließen der App; steht IndexedDB nicht zur Verfügung (z. B. privates Fenster), bleibt
 * sie im Arbeitsspeicher, damit die App online trotzdem funktioniert.
 */
import type { SyncOperation } from "@/domain/sync/operations";
import { connectIndexedDb } from "./indexed-db";

export interface QueuedOperation {
  /** Vorgänge mit gleichem Schlüssel ersetzen sich: Es zählt nur der letzte Stand. */
  key: string;
  /** Wem der Vorgang gehört; nach einem Nutzerwechsel am Gerät wird nichts Fremdes übertragen. */
  userId: string;
  operation: SyncOperation;
  createdAt: number;
}

export interface QueueStorage {
  put: (record: QueuedOperation) => Promise<void>;
  list: (userId: string) => Promise<QueuedOperation[]>;
  /** Löscht den Eintrag nur, wenn er inzwischen nicht durch einen neueren Stand ersetzt wurde. */
  removeIfUnchanged: (key: string, operationId: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

export function byCreation(a: QueuedOperation, b: QueuedOperation): number {
  return a.createdAt - b.createdAt;
}

interface MemoryStorage extends QueueStorage {
  /** Alle Einträge aller Nutzer, z. B. um sie in den dauerhaften Speicher zu übernehmen. */
  all: () => QueuedOperation[];
}

function createMemory(): MemoryStorage {
  const records = new Map<string, QueuedOperation>();
  return {
    put: async (record) => void records.set(record.key, record),
    list: async (userId) => [...records.values()].filter((record) => record.userId === userId).sort(byCreation),
    removeIfUnchanged: async (key, operationId) => {
      if (records.get(key)?.operation.id === operationId) records.delete(key);
    },
    remove: async (key) => void records.delete(key),
    all: () => [...records.values()].sort(byCreation),
  };
}

export function createMemoryStorage(): QueueStorage {
  return createMemory();
}

type MissedRemoval =
  | { kind: "any" }
  | {
      kind: "operation";
      operationId: string;
      /** Der übertragene Stand lag nur im Arbeitsspeicher; ältere dauerhafte Einträge sind überholt. */
      replaced?: { userId: string; createdAt: number };
    };

export interface ResilientStorageOptions {
  /** Öffnet den dauerhaften Speicher. Nach einem Fehler wird neu verbunden. */
  connect: () => Promise<QueueStorage>;
  /** Nach so vielen gescheiterten Zugriffen in Folge bleibt die Warteschlange eine Weile im Arbeitsspeicher. */
  maxFailures?: number;
  /** So lange wird danach kein neuer Verbindungsversuch unternommen. */
  pauseMs?: number;
  now?: () => number;
}

/**
 * Dauerhafter Speicher mit Rückfall auf den Arbeitsspeicher. Ein einzelner Fehler (z. B. unter
 * iOS „Connection to Indexed Database server lost“) führt zu einem neuen Verbindungsaufbau und
 * einem zweiten Versuch. Was in der Zwischenzeit nur im Arbeitsspeicher lag, wird übernommen,
 * sobald der dauerhafte Speicher wieder funktioniert; bis dahin wird es mit angezeigt und
 * übertragen. Erst nach mehreren gescheiterten Zugriffen in Folge bleibt es eine Weile beim
 * Arbeitsspeicher, danach wird es erneut versucht.
 */
export function createResilientStorage(options: ResilientStorageOptions): QueueStorage {
  const memory = createMemory();
  const maxFailures = options.maxFailures ?? 3;
  const pauseMs = options.pauseMs ?? 30_000;
  const now = options.now ?? (() => Date.now());
  let pausedUntil = 0;
  let connection: Promise<QueueStorage> | null = null;
  let failures = 0;
  /**
   * Löschungen, die den dauerhaften Speicher nicht erreicht haben. Sie werden nachgeholt, bevor
   * dort wieder etwas geschrieben wird – sonst käme ein schon übertragener oder verworfener
   * Stand wieder zum Vorschein und würde einen neueren überschreiben.
   */
  const missedRemovals = new Map<string, MissedRemoval>();

  async function attempt<T>(task: (store: QueueStorage) => Promise<T>): Promise<T> {
    connection ??= options.connect();
    const current = connection;
    try {
      return await task(await current);
    } catch (error) {
      // Nur die gescheiterte Verbindung verwerfen, nicht eine inzwischen neu aufgebaute.
      if (connection === current) connection = null;
      throw error;
    }
  }

  async function catchUpRemovals(store: QueueStorage): Promise<void> {
    for (const [key, missed] of missedRemovals) {
      if (missed.kind === "any") {
        await store.remove(key);
      } else {
        await store.removeIfUnchanged(key, missed.operationId);
        // Lag im Arbeitsspeicher ein neuerer Stand, ist der dauerhafte Eintrag älter und überholt.
        if (missed.replaced) {
          const current = (await store.list(missed.replaced.userId)).find((record) => record.key === key);
          if (current && current.createdAt <= missed.replaced.createdAt) await store.removeIfUnchanged(key, current.operation.id);
        }
      }
      missedRemovals.delete(key);
    }
  }

  /** Übernimmt Einträge aus dem Arbeitsspeicher; scheitert das, bleiben sie dort. */
  async function migrate(store: QueueStorage): Promise<void> {
    for (const record of memory.all()) {
      await store.put(record);
      await memory.removeIfUnchanged(record.key, record.operation.id);
    }
  }

  /** Führt den Zugriff aus; `undefined`, wenn der dauerhafte Speicher nicht verfügbar ist. */
  async function withStore<T>(task: (store: QueueStorage) => Promise<T>): Promise<{ value: T } | undefined> {
    if (now() < pausedUntil) return undefined;
    for (let tries = 0; tries < 2; tries++) {
      try {
        const value = await attempt(async (store) => {
          // Erst Versäumtes nachholen und Zwischenstände übernehmen, damit Neueres sie danach ersetzt.
          if (missedRemovals.size > 0) await catchUpRemovals(store);
          if (memory.all().length > 0) await migrate(store);
          return task(store);
        });
        failures = 0;
        return { value };
      } catch {
        // Neuer Verbindungsaufbau beim nächsten Durchlauf.
      }
    }
    failures++;
    if (failures >= maxFailures) {
      failures = 0;
      pausedUntil = now() + pauseMs;
    }
    return undefined;
  }

  return {
    put: async (record) => {
      const stored = await withStore((store) => store.put(record));
      if (stored) await memory.remove(record.key);
      else await memory.put(record);
    },
    list: async (userId) => {
      const stored = await withStore((store) => store.list(userId));
      const merged = new Map<string, QueuedOperation>();
      for (const record of [...(stored?.value ?? []), ...(await memory.list(userId))]) {
        const known = merged.get(record.key);
        if (!known || known.createdAt <= record.createdAt) merged.set(record.key, record);
      }
      return [...merged.values()].sort(byCreation);
    },
    removeIfUnchanged: async (key, operationId) => {
      // Zuerst der dauerhafte Speicher: Dabei wandert ein Zwischenstand dorthin und wird mit gelöscht.
      if (await withStore((store) => store.removeIfUnchanged(key, operationId))) {
        await memory.removeIfUnchanged(key, operationId);
        return;
      }
      const inMemory = memory.all().find((record) => record.key === key && record.operation.id === operationId);
      await memory.removeIfUnchanged(key, operationId);
      const earlier = missedRemovals.get(key);
      // Ein Verwerfen des ganzen Schlüssels schließt diesen Eintrag schon ein.
      if (earlier?.kind === "any") return;
      const replaced = inMemory ? { userId: inMemory.userId, createdAt: inMemory.createdAt } : earlier?.replaced;
      missedRemovals.set(key, { kind: "operation", operationId, replaced });
    },
    remove: async (key) => {
      await memory.remove(key);
      if (!(await withStore((store) => store.remove(key)))) missedRemovals.set(key, { kind: "any" });
    },
  };
}

/** Warteschlange in IndexedDB; fällt bei dauerhaften Fehlern auf den Arbeitsspeicher zurück. */
export function createBrowserStorage(): QueueStorage {
  if (typeof indexedDB === "undefined") return createMemoryStorage();
  return createResilientStorage({ connect: connectIndexedDb });
}
