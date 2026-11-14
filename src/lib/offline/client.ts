"use client";

/**
 * Die eine Warteschlange der App im Browser: IndexedDB als Speicher, `/api/sync` als Ziel.
 */
import type { SyncResult } from "@/domain/sync/operations";
import { createSyncEngine, type SyncEngine } from "./engine";
import { createBrowserStorage } from "./storage";

const SYNC_URL = "/api/sync";
const HTTP_UNAUTHORIZED = 401;

let engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  engine ??= createSyncEngine({
    storage: createBrowserStorage(),
    send: async (operations) => {
      const response = await fetch(SYNC_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operations }),
        credentials: "same-origin",
      });
      // Sitzung abgelaufen: Gemerkte Seiten dürfen offline nicht mehr erscheinen.
      if (response.status === HTTP_UNAUTHORIZED) tellServiceWorker({ type: "clear-pages" });
      if (!response.ok) return null;
      const body = (await response.json()) as { results?: SyncResult[] };
      return body.results ?? null;
    },
  });
  return engine;
}

type ServiceWorkerMessage = { type: "cache-page"; url: string } | { type: "clear-pages" };

/** Nachricht an den Service Worker; ohne aktiven Service Worker passiert nichts. */
export function tellServiceWorker(message: ServiceWorkerMessage): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.controller?.postMessage(message);
}
