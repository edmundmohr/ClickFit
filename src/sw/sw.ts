/// <reference lib="webworker" />

/**
 * Service Worker von ClickFit (Grundgerüst aus Phase 1).
 * - Macht die App installierbar und zeigt eine Offline-Seite, wenn eine Navigation scheitert.
 * - Hält unveränderliche Build-Dateien im Cache (cache-first).
 * Offline-Logging im Training mit Sync-Queue kommt in der Offline-Phase dazu.
 */

export {};
declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = "v1";
const STATIC_CACHE = `clickfit-static-${CACHE_VERSION}`;
const PAGES_CACHE = `clickfit-pages-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";
const IMMUTABLE_PREFIXES = ["/_next/static/", "/icons/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE && key !== PAGES_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkWithOfflineFallback(request: Request): Promise<Response> {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (IMMUTABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkWithOfflineFallback(request));
  }
});
