"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { UnitSystem } from "@/lib/units";
import { saveSetAction } from "../../actions";
import { toSavePayload, type ExerciseDraft } from "./workout-state";

const EDIT_DEBOUNCE_MS = 700;

export interface SetSync {
  /** Merkt einen Satz zum Speichern vor: sofort oder nach einer kurzen Tipp-Pause. */
  schedule: (setId: string, immediately?: boolean) => void;
  /** Schickt alle noch offenen Änderungen sofort ab. */
  flushAll: () => Promise<void>;
  /** Vergisst einen Satz (z. B. nach dem Löschen). */
  forget: (setId: string) => void;
  failed: boolean;
}

/**
 * Speichert geänderte Sätze im Hintergrund. Schlägt ein Speichern fehl (z. B. kein Netz),
 * bleibt der Satz vorgemerkt und kann erneut gesendet werden.
 */
export function useSetSync(exercises: ExerciseDraft[], unitSystem: UnitSystem): SetSync {
  const exercisesRef = useRef(exercises);
  const dirty = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());
  const [failed, setFailed] = useState(false);

  useLayoutEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  const flush = useCallback(
    async (setId: string) => {
      timers.current.delete(setId);
      const exercise = exercisesRef.current.find((item) => item.sets.some((set) => set.id === setId));
      const set = exercise?.sets.find((item) => item.id === setId);
      if (!exercise || !set) {
        dirty.current.delete(setId);
        return;
      }
      const saved = await saveSetAction(toSavePayload(exercise, set, unitSystem)).then(
        (result) => result.ok,
        () => false,
      );
      // Wurde der Satz inzwischen erneut geändert, läuft dafür bereits ein neuer Timer.
      if (saved && !timers.current.has(setId)) dirty.current.delete(setId);
      if (!saved) setFailed(true);
      else if (dirty.current.size === 0) setFailed(false);
    },
    [unitSystem],
  );

  const schedule = useCallback(
    (setId: string, immediately = false) => {
      dirty.current.add(setId);
      const existing = timers.current.get(setId);
      if (existing !== undefined) window.clearTimeout(existing);
      timers.current.set(
        setId,
        window.setTimeout(() => void flush(setId), immediately ? 0 : EDIT_DEBOUNCE_MS),
      );
    },
    [flush],
  );

  const flushAll = useCallback(async () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
    timers.current.clear();
    await Promise.all([...dirty.current].map((setId) => flush(setId)));
  }, [flush]);

  const forget = useCallback((setId: string) => {
    const timer = timers.current.get(setId);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(setId);
    dirty.current.delete(setId);
  }, []);

  // Beim Verlassen oder Wegschalten der Seite offene Änderungen noch abschicken.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushAll();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flushAll]);

  return { schedule, flushAll, forget, failed };
}
