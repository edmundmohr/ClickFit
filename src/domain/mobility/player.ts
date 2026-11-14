/**
 * Zustandsautomat des geführten Ablaufs. Rechnet ausschließlich mit Zeitpunkten, die von
 * außen kommen (`now`), damit der Countdown auch nach kurzem Wegschalten stimmt und die
 * Logik ohne Browser testbar bleibt.
 */
import { STEP_SWITCH_SECONDS } from "./routines";

export interface PlayerStepTiming {
  /** Haltezeit in Sekunden; `null` bei Wiederholungen (weiter per „Fertig“). */
  durationSeconds: number | null;
}

export type PlayerStatus = "idle" | "running" | "paused" | "finished";
/** `prepare` = Wechselzeit vor der Übung, `work` = die Übung selbst. */
export type PlayerPhase = "prepare" | "work";

export interface PlayerState {
  status: PlayerStatus;
  index: number;
  phase: PlayerPhase;
  /** Ende des laufenden Countdowns (ms seit Epoche); `null`, wenn keiner läuft. */
  endsAt: number | null;
  /** Restzeit eines angehaltenen Countdowns; `null`, wenn der Schritt keinen hat. */
  remainingMs: number | null;
  /** Zuletzt gemeldeter Zeitpunkt. */
  now: number;
  /** Aktive Zeit bis zum letzten Anhalten. */
  elapsedMs: number;
  runningSince: number | null;
  /** Zahl der abgelaufenen Übungs-Countdowns; jeder Anstieg ist ein Signalton. */
  signals: number;
}

export type PlayerEvent =
  | { type: "start"; now: number }
  | { type: "pause"; now: number }
  | { type: "next"; now: number }
  | { type: "previous"; now: number }
  | { type: "tick"; now: number }
  | { type: "reset" };

export const INITIAL_PLAYER_STATE: PlayerState = {
  status: "idle",
  index: 0,
  phase: "prepare",
  endsAt: null,
  remainingMs: null,
  now: 0,
  elapsedMs: 0,
  runningSince: null,
  signals: 0,
};

const SWITCH_MS = STEP_SWITCH_SECONDS * 1000;

function withCountdown(state: PlayerState, now: number, countdownMs: number | null): PlayerState {
  const running = state.status === "running";
  return {
    ...state,
    now,
    endsAt: running && countdownMs !== null ? now + countdownMs : null,
    remainingMs: running ? null : countdownMs,
  };
}

function finish(state: PlayerState, now: number): PlayerState {
  const active = state.runningSince === null ? 0 : now - state.runningSince;
  return {
    ...state,
    status: "finished",
    now,
    endsAt: null,
    remainingMs: null,
    elapsedMs: state.elapsedMs + active,
    runningSince: null,
  };
}

/** Wechselt zu einem Schritt; jeder Schritt beginnt mit der Wechselzeit. */
function enterStep(state: PlayerState, index: number, now: number, stepCount: number): PlayerState {
  if (index >= stepCount) return finish(state, now);
  return withCountdown({ ...state, index: Math.max(0, index), phase: "prepare" }, now, SWITCH_MS);
}

function onCountdownEnd(state: PlayerState, now: number, steps: readonly PlayerStepTiming[]): PlayerState {
  if (state.phase === "prepare") {
    const seconds = steps[state.index]?.durationSeconds ?? null;
    return withCountdown({ ...state, phase: "work" }, now, seconds === null ? null : seconds * 1000);
  }
  return enterStep({ ...state, signals: state.signals + 1 }, state.index + 1, now, steps.length);
}

export function reducePlayer(state: PlayerState, event: PlayerEvent, steps: readonly PlayerStepTiming[]): PlayerState {
  switch (event.type) {
    case "reset":
      return INITIAL_PLAYER_STATE;
    case "start": {
      if (steps.length === 0) return state;
      if (state.status === "idle") {
        const running: PlayerState = { ...INITIAL_PLAYER_STATE, status: "running", runningSince: event.now };
        return enterStep(running, 0, event.now, steps.length);
      }
      if (state.status !== "paused") return state;
      return {
        ...state,
        status: "running",
        now: event.now,
        runningSince: event.now,
        endsAt: state.remainingMs === null ? null : event.now + state.remainingMs,
        remainingMs: null,
      };
    }
    case "pause": {
      if (state.status !== "running") return state;
      return {
        ...state,
        status: "paused",
        now: event.now,
        remainingMs: state.endsAt === null ? null : Math.max(0, state.endsAt - event.now),
        endsAt: null,
        elapsedMs: state.elapsedMs + (state.runningSince === null ? 0 : event.now - state.runningSince),
        runningSince: null,
      };
    }
    case "next":
    case "previous": {
      if (state.status !== "running" && state.status !== "paused") return state;
      const target = state.index + (event.type === "next" ? 1 : -1);
      return enterStep(state, target, event.now, steps.length);
    }
    case "tick": {
      if (state.status !== "running") return state;
      if (state.endsAt !== null && event.now >= state.endsAt) return onCountdownEnd(state, event.now, steps);
      return { ...state, now: event.now };
    }
  }
}

/** Verbleibende Sekunden des aktuellen Countdowns; `null`, wenn der Schritt keinen hat. */
export function playerRemainingSeconds(state: PlayerState): number | null {
  if (state.endsAt !== null) return Math.max(0, Math.ceil((state.endsAt - state.now) / 1000));
  return state.remainingMs === null ? null : Math.ceil(state.remainingMs / 1000);
}

/** Aktive Zeit in Sekunden (ohne Pausen), mindestens eine Sekunde. */
export function playerElapsedSeconds(state: PlayerState): number {
  const active = state.runningSince === null ? 0 : state.now - state.runningSince;
  return Math.max(1, Math.round((state.elapsedMs + active) / 1000));
}
