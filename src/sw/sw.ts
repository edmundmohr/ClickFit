/// <reference lib="webworker" />

/**
 * Service Worker von ClickFit.
 * - Hält unveränderliche Build-Dateien im Cache (cache-first).
 * - Merkt sich zuletzt geöffnete Seiten: Ohne Netz zeigt er den zuletzt gesehenen Stand,
 *   sonst die Offline-Seite. Eingaben im Training liegen in der Warteschlange (IndexedDB)
 *   und werden von der App selbst übertragen.
 * - Zeigt die Benachrichtigung am Ende der Pause (Web Push).
 */
import workoutTexts from "../../messages/de/workout.json";
import { showsLogin } from "./session";

export {};
declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = "v2";
const STATIC_CACHE = `clickfit-static-${CACHE_VERSION}`;
const PAGES_CACHE = `clickfit-pages-${CACHE_VERSION}`;
const OFFLINE_URL = "/offline";
const IMMUTABLE_PREFIXES = ["/_next/static/", "/icons/", "/illustrations/"];
/** Seiten, die nie aus dem Cache kommen sollen. */
const UNCACHED_PREFIXES = ["/api/", "/login"];
const MAX_CACHED_PAGES = 40;
const REST_TIMER_TAG = "rest-timer";

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

function isCacheablePage(url: URL, response: Response): boolean {
  // Umleitungen (z. B. zur Anmeldung) und Fehlerseiten gehören nicht in den Cache.
  return (
    response.ok &&
    !response.redirected &&
    (response.headers.get("content-type") ?? "").includes("text/html") &&
    !UNCACHED_PREFIXES.some((prefix) => url.pathname.startsWith(prefix)) &&
    url.pathname !== OFFLINE_URL
  );
}

/** Hält den Seiten-Cache klein: Die ältesten Einträge fallen heraus. */
async function trimPages(cache: Cache): Promise<void> {
  const keys = await cache.keys();
  const pages = keys.filter((request) => new URL(request.url).pathname !== OFFLINE_URL);
  for (const request of pages.slice(0, Math.max(0, pages.length - MAX_CACHED_PAGES))) await cache.delete(request);
}

const ASSET_PATTERN = /\/_next\/static\/[^"'\\\s)<>]+/g;
const MAX_ASSETS_PER_PAGE = 120;

/**
 * Lädt die Skripte und Stile, die eine Seite braucht, in den Cache. Sonst käme ohne Netz zwar
 * die Seite aus dem Cache, bliebe aber ohne Funktion, wenn ihre Dateien nie über den
 * Service Worker geladen wurden (z. B. beim allerersten Besuch).
 */
async function storePageAssets(html: string): Promise<void> {
  const paths = [...new Set(html.match(ASSET_PATTERN) ?? [])].slice(0, MAX_ASSETS_PER_PAGE);
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    paths.map(async (path) => {
      if (await cache.match(path)) return;
      const response = await fetch(path).catch(() => null);
      if (response?.ok) await cache.put(path, response);
    }),
  );
}

async function storePage(url: URL, response: Response): Promise<void> {
  if (!isCacheablePage(url, response)) return;
  await storePageAssets(await response.clone().text());
  const cache = await caches.open(PAGES_CACHE);
  // Erst löschen, dann schreiben: So wandert die Seite ans Ende und gilt als zuletzt genutzt.
  await cache.delete(url.pathname + url.search);
  await cache.put(url.pathname + url.search, response);
  await trimPages(cache);
}

/**
 * Speichert die Seite. Liefert der Server stattdessen die Anmeldeseite, ist niemand mehr
 * angemeldet: Dann dürfen die gemerkten Seiten des vorigen Nutzers offline nicht mehr erscheinen.
 */
async function handlePageResponse(url: URL, response: Response): Promise<void> {
  if (showsLogin(response.url)) await clearPages();
  else await storePage(url, response);
}

/** Netz zuerst; ohne Netz der zuletzt gesehene Stand der Seite, sonst die Offline-Seite. */
async function pageWithOfflineFallback(event: FetchEvent): Promise<Response> {
  const url = new URL(event.request.url);
  try {
    const response = await fetch(event.request);
    event.waitUntil(handlePageResponse(url, response.clone()));
    return response;
  } catch {
    const cache = await caches.open(PAGES_CACHE);
    const cached = (await cache.match(url.pathname + url.search)) ?? (await cache.match(url.pathname));
    return cached ?? (await cache.match(OFFLINE_URL)) ?? Response.error();
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
    event.respondWith(pageWithOfflineFallback(event));
  }
});

type ClientMessage = { type: "cache-page"; url: string } | { type: "clear-pages" };

/** Lädt eine Seite im Hintergrund in den Cache (z. B. das laufende Training). */
async function cachePage(path: string): Promise<void> {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return;
  const response = await fetch(url, { credentials: "same-origin", headers: { accept: "text/html" } });
  await handlePageResponse(url, response);
}

/** Entfernt alle gemerkten Seiten (Abmelden, Anmelden, abgelaufene Sitzung), die Offline-Seite bleibt. */
async function clearPages(): Promise<void> {
  const cache = await caches.open(PAGES_CACHE);
  for (const request of await cache.keys()) {
    if (new URL(request.url).pathname !== OFFLINE_URL) await cache.delete(request);
  }
}

self.addEventListener("message", (event) => {
  const message = event.data as ClientMessage | undefined;
  if (message?.type === "cache-page" && typeof message.url === "string") {
    event.waitUntil(cachePage(message.url).catch(() => undefined));
  } else if (message?.type === "clear-pages") {
    event.waitUntil(clearPages());
  }
});

// Die einzige Push-Nachricht der App meldet das Ende der Pause. Sie kommt ohne Inhalt:
// Ob sie noch gilt, hat der Server vor dem Senden geprüft.
self.addEventListener("push", (event) => {
  event.waitUntil(
    self.registration.showNotification(workoutTexts.pushTitle, {
      body: workoutTexts.pushBody,
      tag: REST_TIMER_TAG,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => new URL(client.url).pathname.startsWith("/workout/")) ?? clients[0];
      return open ? open.focus() : self.clients.openWindow("/training");
    }),
  );
});
