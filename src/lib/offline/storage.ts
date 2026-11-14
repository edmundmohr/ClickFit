/**
 * Speicher der Offline-Warteschlange. Im Browser liegt sie in IndexedDB und übersteht damit
 * das Schließen der App; steht IndexedDB nicht zur Verfügung (z. B. privates Fenster), bleibt
 * sie im Arbeitsspeicher, damit die App online trotzdem funktioniert.
 */
import type { SyncOperation } from "@/domain/sync/operations";

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

function byCreation(a: QueuedOperation, b: QueuedOperation): number {
  return a.createdAt - b.createdAt;
}

export function createMemoryStorage(): QueueStorage {
  const records = new Map<string, QueuedOperation>();
  return {
    put: async (record) => void records.set(record.key, record),
    list: async (userId) => [...records.values()].filter((record) => record.userId === userId).sort(byCreation),
    removeIfUnchanged: async (key, operationId) => {
      if (records.get(key)?.operation.id === operationId) records.delete(key);
    },
    remove: async (key) => void records.delete(key),
  };
}

const DB_NAME = "clickfit-offline";
const STORE = "operations";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB unavailable"));
    request.onblocked = () => reject(new Error("IndexedDB blocked"));
  });
}

function run<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, mode);
    const request = task(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request ? request.result : undefined);
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Warteschlange in IndexedDB; fällt bei Fehlern auf den Arbeitsspeicher zurück. */
export function createBrowserStorage(): QueueStorage {
  const fallback = createMemoryStorage();
  let database: Promise<IDBDatabase> | null = null;
  let broken = typeof indexedDB === "undefined";

  async function withDatabase<T>(task: (db: IDBDatabase) => Promise<T>, otherwise: () => Promise<T>): Promise<T> {
    if (broken) return otherwise();
    try {
      database ??= openDatabase();
      return await task(await database);
    } catch {
      broken = true;
      return otherwise();
    }
  }

  return {
    put: (record) =>
      withDatabase(
        async (db) => void (await run(db, "readwrite", (store) => store.put(record))),
        () => fallback.put(record),
      ),
    list: (userId) =>
      withDatabase(
        async (db) => {
          const all = (await run<QueuedOperation[]>(db, "readonly", (store) => store.getAll())) ?? [];
          return all.filter((record) => record.userId === userId).sort(byCreation);
        },
        () => fallback.list(userId),
      ),
    removeIfUnchanged: (key, operationId) =>
      withDatabase(
        (db) =>
          new Promise<void>((resolve, reject) => {
            const transaction = db.transaction(STORE, "readwrite");
            const store = transaction.objectStore(STORE);
            const request = store.get(key) as IDBRequest<QueuedOperation | undefined>;
            request.onsuccess = () => {
              if (request.result?.operation.id === operationId) store.delete(key);
            };
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
          }),
        () => fallback.removeIfUnchanged(key, operationId),
      ),
    remove: (key) =>
      withDatabase(
        async (db) => void (await run(db, "readwrite", (store) => store.delete(key))),
        () => fallback.remove(key),
      ),
  };
}
