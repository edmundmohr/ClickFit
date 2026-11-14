/**
 * Erholungsstatus je Muskelgruppe (0–100 %), berechnet aus Volumen, Intensität und der Zeit
 * seit dem Training. Jede Einheit erzeugt Ermüdung, die linear abklingt.
 */
import { MUSCLES, type Muscle } from "@/domain/exercises/types";
import { emptyMuscleValues, setShares, type MuscleValues } from "./muscle-load";
import type { ExerciseLookup, TrainedSet } from "./types";

const HOUR_MS = 60 * 60 * 1000;
/** So viele harte Sätze erschöpfen eine Muskelgruppe vollständig. */
const SETS_FOR_FULL_FATIGUE = 10;
/** Erholungsdauer: mindestens ein Tag, bei voller Erschöpfung drei Tage. */
const MIN_RECOVERY_HOURS = 24;
const EXTRA_RECOVERY_HOURS = 48;
/** Ältere Sätze sind in jedem Fall verarbeitet. */
export const RECOVERY_LOOKBACK_DAYS = 5;

/** Wie stark ein Satz zählt: Sätze nah am Muskelversagen ermüden mehr als lockere. */
export function intensityFactor(set: Pick<TrainedSet, "rir" | "type">): number {
  if (set.type === "failure") return 1.1;
  if (set.rir === null) return 0.9;
  if (set.rir >= 4) return 0.6;
  if (set.rir === 3) return 0.75;
  if (set.rir === 2) return 0.9;
  return 1;
}

function recoveryHours(fatigue: number): number {
  return MIN_RECOVERY_HOURS + EXTRA_RECOVERY_HOURS * fatigue;
}

/** Verbleibende Ermüdung (0–1) einer Belastung nach `elapsedHours`. */
function remaining(fatigue: number, elapsedHours: number): number {
  if (elapsedHours < 0) return 0;
  return fatigue * Math.max(0, 1 - elapsedHours / recoveryHours(fatigue));
}

export interface RecoveryOverride {
  /** Vom Nutzer gesetzter Erholungswert in Prozent. */
  percent: number;
  setAt: Date;
}

/**
 * Erholung aller Muskelgruppen zum Zeitpunkt `now`.
 * Ein manueller Wert ersetzt alle Belastungen davor; spätere Einheiten kommen wieder dazu.
 */
export function recoveryStatus(
  sets: readonly TrainedSet[],
  lookup: ExerciseLookup,
  now: Date,
  overrides: Partial<Record<Muscle, RecoveryOverride>> = {},
): MuscleValues {
  // Ermüdung wird pro Einheit und Muskel gesammelt und klingt ab dem letzten Satz der Einheit ab.
  const loads = new Map<string, { muscle: Muscle; effectiveSets: number; at: number }>();
  for (const set of sets) {
    const at = set.completedAt.getTime();
    if (at > now.getTime()) continue;
    const shares = setShares(set, lookup);
    for (const muscle of MUSCLES) {
      const share = shares[muscle];
      if (share === undefined) continue;
      const override = overrides[muscle];
      if (override && at <= override.setAt.getTime()) continue;
      const id = `${set.sessionId}:${muscle}`;
      const load = loads.get(id) ?? { muscle, effectiveSets: 0, at };
      load.effectiveSets += share * intensityFactor(set);
      load.at = Math.max(load.at, at);
      loads.set(id, load);
    }
  }

  const fatigue = emptyMuscleValues();
  for (const load of loads.values()) {
    const amount = Math.min(1, load.effectiveSets / SETS_FOR_FULL_FATIGUE);
    fatigue[load.muscle] += remaining(amount, (now.getTime() - load.at) / HOUR_MS);
  }
  for (const muscle of MUSCLES) {
    const override = overrides[muscle];
    if (!override) continue;
    const amount = 1 - Math.min(Math.max(override.percent, 0), 100) / 100;
    fatigue[muscle] += remaining(amount, (now.getTime() - override.setAt.getTime()) / HOUR_MS);
  }

  const status = emptyMuscleValues();
  for (const muscle of MUSCLES) status[muscle] = Math.round((1 - Math.min(1, fatigue[muscle])) * 100);
  return status;
}

export const RECOVERY_LEVELS = ["fresh", "recovering", "fatigued"] as const;
export type RecoveryLevel = (typeof RECOVERY_LEVELS)[number];

export function recoveryLevel(percent: number): RecoveryLevel {
  if (percent >= 85) return "fresh";
  if (percent >= 50) return "recovering";
  return "fatigued";
}
