"use client";

import { useEffect } from "react";

const CACHE_PREFIX = "clickfit-";

/**
 * Registriert den Service Worker im Produktions-Build. Beim Entwickeln wird ein eventuell
 * noch aktiver Service Worker samt Cache entfernt: Er würde sonst veraltete Dateien ausliefern.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // Schlägt die Registrierung fehl, fehlt nur die Offline-Unterstützung; die App läuft weiter.
      });
      return;
    }
    void navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) void registration.unregister();
    });
    if ("caches" in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) if (key.startsWith(CACHE_PREFIX)) void caches.delete(key);
      });
    }
  }, []);
  return null;
}
