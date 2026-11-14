"use client";

import { useEffect, useRef } from "react";
import { isRestPushEnabled, reportRestTimer } from "./push-client";

/**
 * Benachrichtigung am Ende der Pause, wenn die App im Hintergrund ist: Verschwindet die App
 * während einer laufenden Pause aus dem Vordergrund, erfährt der Server das Ende der Pause und
 * schickt dann einen Push. Kommt die App vorher zurück, wird die Benachrichtigung abgesagt –
 * im Vordergrund melden sich Ton und Anzeige selbst.
 */
export function useRestPush(endsAt: number | null): void {
  const endsAtRef = useRef(endsAt);
  const scheduled = useRef(false);

  useEffect(() => {
    endsAtRef.current = endsAt;
  }, [endsAt]);

  useEffect(() => {
    const onVisibility = () => {
      if (!isRestPushEnabled()) return;
      const end = endsAtRef.current;
      if (document.visibilityState === "hidden") {
        if (end !== null && end > Date.now()) {
          reportRestTimer(end);
          scheduled.current = true;
        }
      } else if (scheduled.current) {
        reportRestTimer(null);
        scheduled.current = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
}
