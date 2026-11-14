/**
 * Zugriff auf die Warteschlange in IndexedDB. Jeder Zugriff endet mit Erfolg oder Fehler – auch
 * bei abgebrochenen Transaktionen –, damit die Übertragung nie hängen bleibt.
 */
import { byCreation, type QueueStorage, type QueuedOperation } from "./storage";

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

/**
 * Führt eine Transaktion aus. `task` stellt die Anfragen und liefert eine Funktion, die nach
 * Abschluss das Ergebnis bestimmt. Abbruch und Fehler führen zur Ablehnung (statt ewig zu warten).
 */
function run<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  task: (store: IDBObjectStore) => () => T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    // `transaction()` wirft z. B. bei geschlossener Verbindung: Das landet hier als Ablehnung.
    const transaction = database.transaction(STORE, mode);
    const result = task(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(result());
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

/** Öffnet die Datenbank; nach einem Fehler baut die aufrufende Stelle die Verbindung neu auf. */
export async function connectIndexedDb(): Promise<QueueStorage> {
  const database = await openDatabase();
  // Eine neuere Version (z. B. anderer Tab nach einem Update) soll nicht blockiert werden.
  database.onversionchange = () => database.close();

  return {
    put: (record) =>
      run(database, "readwrite", (store) => {
        store.put(record);
        return () => undefined;
      }),
    list: async (userId) => {
      const all = await run(database, "readonly", (store) => {
        const request = store.getAll() as IDBRequest<QueuedOperation[]>;
        return () => request.result ?? [];
      });
      return all.filter((record) => record.userId === userId).sort(byCreation);
    },
    removeIfUnchanged: (key, operationId) =>
      run(database, "readwrite", (store) => {
        const request = store.get(key) as IDBRequest<QueuedOperation | undefined>;
        request.onsuccess = () => {
          if (request.result?.operation.id === operationId) store.delete(key);
        };
        return () => undefined;
      }),
    remove: (key) =>
      run(database, "readwrite", (store) => {
        store.delete(key);
        return () => undefined;
      }),
  };
}
