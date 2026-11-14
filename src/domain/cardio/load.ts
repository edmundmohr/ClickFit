/**
 * Rechnet Cardio und Zusatzsport in Muskelbelastung um (Eingabe für die Erholung)
 * und liefert Kennzahlen wie Tempo und Geschwindigkeit.
 */
import { MUSCLES, type Muscle } from "@/domain/exercises/types";
import type { ExtraLoad } from "@/domain/progress/recovery";
import type { Activity, ActivityType, Intensity } from "./types";

/** Eine Stunde mit mittlerer Anstrengung entspricht so vielen harten Sätzen auf dem Hauptmuskel (Anteil 1). */
export const SETS_PER_MODERATE_HOUR = 5;
/** Mehr als eine voll erschöpfte Muskelgruppe gibt es nicht (siehe Erholung: 10 Sätze). */
export const MAX_EFFECTIVE_SETS = 10;
const MIN_EFFECTIVE_SETS = 0.05;

export const INTENSITY_FACTOR: Record<Intensity, number> = {
  easy: 0.6,
  moderate: 1,
  hard: 1.4,
};

/**
 * Verteilung je Sportart: 1 = Hauptmuskel, kleinere Werte = anteilig beteiligt.
 * Schonende Arten (Gehen, Yoga, Sonstiges) bleiben auch beim Hauptmuskel deutlich unter 1.
 */
export const MUSCLE_SHARES: Record<ActivityType, Partial<Record<Muscle, number>>> = {
  running: { quads: 1, calves: 0.9, hamstrings: 0.8, glutes: 0.7, abs: 0.2 },
  cycling: { quads: 1, glutes: 0.7, calves: 0.5, hamstrings: 0.4 },
  rowing: { lats: 1, upper_back: 0.8, quads: 0.7, glutes: 0.6, biceps: 0.5, hamstrings: 0.4, lower_back: 0.4, forearms: 0.3 },
  walking: { calves: 0.35, quads: 0.3, glutes: 0.3, hamstrings: 0.25 },
  swimming: { lats: 1, front_delts: 0.7, triceps: 0.6, upper_back: 0.5, chest: 0.4, rear_delts: 0.3, abs: 0.3 },
  cross_trainer: { quads: 0.8, glutes: 0.6, hamstrings: 0.5, calves: 0.4, front_delts: 0.2, lats: 0.2 },
  hiking: { quads: 0.6, glutes: 0.6, calves: 0.6, hamstrings: 0.4, lower_back: 0.2 },
  football: { quads: 1, hamstrings: 0.9, calves: 0.8, glutes: 0.7, adductors: 0.6, abs: 0.2 },
  racket_sport: { quads: 0.7, calves: 0.6, glutes: 0.5, forearms: 0.5, front_delts: 0.4, hamstrings: 0.4, obliques: 0.3 },
  climbing: { forearms: 1, lats: 0.9, biceps: 0.8, upper_back: 0.5, rear_delts: 0.3, abs: 0.3 },
  martial_arts: { front_delts: 0.6, abs: 0.6, quads: 0.6, obliques: 0.5, glutes: 0.5, triceps: 0.4, lats: 0.4, calves: 0.4 },
  team_sport: { quads: 0.9, hamstrings: 0.7, calves: 0.7, glutes: 0.6, front_delts: 0.3, abs: 0.2 },
  skiing: { quads: 1, glutes: 0.7, adductors: 0.4, hamstrings: 0.4, abs: 0.3, lower_back: 0.3 },
  dancing: { calves: 0.6, quads: 0.5, glutes: 0.5, hamstrings: 0.3, abs: 0.2 },
  yoga: { abs: 0.15, lower_back: 0.15, front_delts: 0.1, hamstrings: 0.1, glutes: 0.1 },
  other: { quads: 0.3, glutes: 0.3, hamstrings: 0.25, calves: 0.25, abs: 0.2, lats: 0.2, front_delts: 0.2 },
};

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Belastung einer Einheit je Muskelgruppe, skaliert mit Dauer und Anstrengung. */
export function activityLoads(activity: Activity): ExtraLoad[] {
  const hours = Math.max(0, activity.durationSeconds) / 3600;
  const base = SETS_PER_MODERATE_HOUR * hours * INTENSITY_FACTOR[activity.intensity];
  const shares = MUSCLE_SHARES[activity.type];
  const loads: ExtraLoad[] = [];
  for (const muscle of MUSCLES) {
    const share = shares[muscle];
    if (share === undefined) continue;
    const effectiveSets = round(Math.min(MAX_EFFECTIVE_SETS, base * share), 2);
    if (effectiveSets < MIN_EFFECTIVE_SETS) continue;
    loads.push({ id: activity.id, muscle, effectiveSets, at: activity.endedAt });
  }
  return loads;
}

/** Arten, bei denen man das Tempo in min/km angibt; sonst zählt die Geschwindigkeit in km/h. */
const PACE_TYPES: readonly ActivityType[] = ["running", "walking", "hiking"];

export function usesPace(type: ActivityType): boolean {
  return PACE_TYPES.includes(type);
}

/** Tempo in Sekunden pro Kilometer; ohne Distanz oder Dauer `null`. */
export function paceSecondsPerKm(distanceMeters: number | null, durationSeconds: number): number | null {
  if (distanceMeters === null || distanceMeters <= 0 || durationSeconds <= 0) return null;
  return Math.round(durationSeconds / (distanceMeters / 1000));
}

/** Geschwindigkeit in km/h; ohne Distanz oder Dauer `null`. */
export function speedKmh(distanceMeters: number | null, durationSeconds: number): number | null {
  if (distanceMeters === null || distanceMeters <= 0 || durationSeconds <= 0) return null;
  return round(distanceMeters / 1000 / (durationSeconds / 3600), 1);
}
