"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useSyncState } from "@/components/offline-sync";
import { getSyncEngine } from "@/lib/offline/client";
import { toSavePayload, type ExerciseDraft } from "./workout-state";

const EDIT_DEBOUNCE_MS = 700;

export interface SetSync {
  /** Merkt einen Satz zum Speichern vor: sofort oder nach einer kurzen Tipp-Pause. */
  schedule: (setId: string, immediately?: boolean) => void;
  /** Schreibt alle offenen Änderungen in die Warteschlange und überträgt sie; `true`, wenn alles angekommen ist. */
  flushAll: () => Promise<boolean>;
  /** Löscht einen Satz (auch auf dem Server, sobald Verbindung besteht). */
  remove: (setId: string) => void;
  /** Es warten Änderungen, und der letzte Übertragungsversuch ist gescheitert. */
  failed: boolean;
  /** Zahl der noch nicht übertragenen Änderungen. */
  pending: number;
}

/**
 * Speichert geänderte Sätze im Hintergrund. Jede Änderung landet zuerst in der Warteschlange
 * auf dem Gerät (IndexedDB) und wird dann übertragen: So geht ohne Netz nichts verloren, und
 * nach einem Neuladen ist der Stand wieder da.
 */
export function useSetSync(exercises: ExerciseDraft[]): SetSync {
  const exercisesRef = useRef(exercises);
  const timers = useRef(new Map<string, number>());
  const state = useSyncState();

  useLayoutEffect(() => {
    exercisesRef.current = exercises;
  }, [exercises]);

  /** Legt den aktuellen Stand des Satzes in die Warteschlange. */
  const store = useCallback(async (setId: string) => {
    timers.current.delete(setId);
    const exercise = exercisesRef.current.find((item) => item.sets.some((set) => set.id === setId));
    const set = exercise?.sets.find((item) => item.id === setId);
    if (!exercise || !set) return;
    await getSyncEngine().enqueue({ type: "set.save", payload: toSavePayload(exercise, set) });
  }, []);

  const schedule = useCallback(
    (setId: string, immediately = false) => {
      const existing = timers.current.get(setId);
      if (existing !== undefined) window.clearTimeout(existing);
      timers.current.set(
        setId,
        window.setTimeout(
          () => void store(setId).then(() => getSyncEngine().syncNow()),
          immediately ? 0 : EDIT_DEBOUNCE_MS,
        ),
      );
    },
    [store],
  );

  const flushAll = useCallback(async () => {
    const waiting = [...timers.current.entries()];
    for (const [, timer] of waiting) window.clearTimeout(timer);
    await Promise.all(waiting.map(([setId]) => store(setId)));
    return getSyncEngine().syncNow();
  }, [store]);

  const remove = useCallback((setId: string) => {
    const timer = timers.current.get(setId);
    if (timer !== undefined) window.clearTimeout(timer);
    timers.current.delete(setId);
    // Der Löschvorgang ersetzt einen noch wartenden Speichervorgang desselben Satzes.
    const engine = getSyncEngine();
    void engine.enqueue({ type: "set.delete", payload: { setId } }).then(() => engine.syncNow());
  }, []);

  // Beim Verlassen oder Wegschalten der Seite offene Änderungen noch sichern.
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

  return { schedule, flushAll, remove, failed: state.failed && state.pending > 0, pending: state.pending };
}
