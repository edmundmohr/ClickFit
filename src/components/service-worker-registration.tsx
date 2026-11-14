"use client";

import { useEffect } from "react";

/** Registriert den Service Worker nur im Produktions-Build (vermeidet veraltete Caches beim Entwickeln). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Schlägt die Registrierung fehl, fehlt nur die Offline-Unterstützung; die App läuft weiter.
    });
  }, []);
  return null;
}
