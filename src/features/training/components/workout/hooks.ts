"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Aktuelle Zeit, die im Sekundentakt aktualisiert wird. `null` bis zum ersten Rendern im Browser. */
export function useNow(active: boolean, intervalMs = 1000): number | null {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    if (!active) return;
    const timer = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}

/**
 * Hält den Bildschirm an (Wake Lock API). Der Browser gibt die Sperre frei, sobald die
 * Seite in den Hintergrund geht; deshalb wird sie beim Zurückkehren neu angefordert.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const request = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) await lock.release();
        else sentinel = lock;
      } catch {
        // Z. B. im Stromsparmodus verweigert: Das Training funktioniert trotzdem.
      }
    };
    void request();
    document.addEventListener("visibilitychange", request);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", request);
      void sentinel?.release();
    };
  }, [active]);
}

const BEEP_FREQUENCY_HZ = 880;
const BEEP_PATTERN = [0, 0.25, 0.5];
const BEEP_LENGTH_SECONDS = 0.15;
const VIBRATION_PATTERN = [200, 100, 200, 100, 400];

/**
 * Ton und Vibration am Ende der Pause. `prime` muss in einer Nutzeraktion (Tipp) aufgerufen
 * werden: iOS erlaubt Audio erst danach.
 */
export function useAlertSignal(): { prime: () => void; signal: () => void } {
  const contextRef = useRef<AudioContext | null>(null);

  const prime = useCallback(() => {
    try {
      contextRef.current ??= new AudioContext();
      if (contextRef.current.state === "suspended") void contextRef.current.resume();
    } catch {
      // Ohne Web Audio bleibt nur die Anzeige.
    }
  }, []);

  const signal = useCallback(() => {
    const context = contextRef.current;
    if (context && context.state === "running") {
      for (const offset of BEEP_PATTERN) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = BEEP_FREQUENCY_HZ;
        gain.gain.value = 0.25;
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(context.currentTime + offset);
        oscillator.stop(context.currentTime + offset + BEEP_LENGTH_SECONDS);
      }
    }
    // Vibration gibt es auf Android; iOS unterstützt sie im Browser nicht.
    if ("vibrate" in navigator) navigator.vibrate(VIBRATION_PATTERN);
  }, []);

  useEffect(() => () => void contextRef.current?.close(), []);
  return { prime, signal };
}

export interface RestTimer {
  /** Verbleibende Sekunden; `null`, wenn keine Pause läuft. */
  remaining: number | null;
  /** Zeitpunkt (ms), zu dem die Pause endet; `null`, wenn keine läuft. */
  endsAt: number | null;
  total: number;
  /** Die Pause ist gerade abgelaufen (kurze Meldung). */
  justFinished: boolean;
  start: (seconds: number) => void;
  adjust: (deltaSeconds: number) => void;
  stop: () => void;
}

const FINISHED_NOTICE_MS = 4000;
const TICK_MS = 250;

/** Pausentimer auf Basis eines Endzeitpunkts, damit er auch nach kurzem Wegschalten stimmt. */
export function useRestTimer(onFinished: () => void): RestTimer {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [now, setNow] = useState(0);
  const [justFinished, setJustFinished] = useState(false);
  const onFinishedRef = useRef(onFinished);

  useEffect(() => {
    onFinishedRef.current = onFinished;
  }, [onFinished]);

  useEffect(() => {
    if (endsAt === null) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) {
        setEndsAt(null);
        setJustFinished(true);
        onFinishedRef.current();
      }
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  useEffect(() => {
    if (!justFinished) return;
    const timer = window.setTimeout(() => setJustFinished(false), FINISHED_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [justFinished]);

  const start = useCallback((seconds: number) => {
    // Ohne Pause (0 s) gibt es nichts herunterzuzählen – und keinen Signalton, keine Mitteilung.
    if (seconds <= 0) {
      setEndsAt(null);
      return;
    }
    const current = Date.now();
    setNow(current);
    setTotal(seconds);
    setJustFinished(false);
    setEndsAt(current + seconds * 1000);
  }, []);

  const adjust = useCallback((deltaSeconds: number) => {
    setEndsAt((current) => (current === null ? null : Math.max(current + deltaSeconds * 1000, Date.now())));
    setTotal((current) => Math.max(current + deltaSeconds, 0));
  }, []);

  const stop = useCallback(() => setEndsAt(null), []);

  const remaining = endsAt === null ? null : Math.max(0, Math.ceil((endsAt - now) / 1000));
  return { remaining, endsAt, total, justFinished, start, adjust, stop };
}
