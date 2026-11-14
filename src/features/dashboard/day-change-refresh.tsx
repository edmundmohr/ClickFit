"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toLocalDate, type LocalDate } from "@/lib/dates";

/** So oft wird geprüft, ob ein neuer Tag begonnen hat, solange die Seite sichtbar ist. */
const CHECK_INTERVAL_MS = 60_000;

/**
 * Lädt die Heute-Seite neu, sobald lokal ein neuer Tag begonnen hat – etwa wenn die PWA über
 * Mitternacht offen bleibt oder morgens aus dem Hintergrund zurückkommt.
 */
export function DayChangeRefresh({ today }: { today: LocalDate }) {
  const router = useRouter();

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible" && toLocalDate(new Date()) !== today) router.refresh();
    };
    const timer = window.setInterval(check, CHECK_INTERVAL_MS);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [router, today]);

  return null;
}
