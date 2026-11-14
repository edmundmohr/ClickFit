/**
 * Grundtypen für Cardio und Zusatzsport. Reine Typen ohne Framework.
 */
import type { LocalDate } from "@/lib/dates";

/** Ausdauerarten, die sich als Cardio-Einheit planen lassen. */
export const CARDIO_ACTIVITY_TYPES = ["running", "cycling", "rowing", "walking", "swimming", "cross_trainer"] as const;

/** Zusatzsportarten: werden geloggt und belasten die Erholung, aber nicht als Cardio geplant. */
export const SPORT_ACTIVITY_TYPES = [
  "hiking",
  "football",
  "racket_sport",
  "climbing",
  "martial_arts",
  "team_sport",
  "skiing",
  "dancing",
  "yoga",
  "other",
] as const;

export const ACTIVITY_TYPES = [...CARDIO_ACTIVITY_TYPES, ...SPORT_ACTIVITY_TYPES] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const INTENSITIES = ["easy", "moderate", "hard"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export const HEART_RATE_ZONES = [1, 2, 3, 4, 5] as const;
export type HeartRateZone = (typeof HEART_RATE_ZONES)[number];

/** Intervalltraining: Belastung und Pause, `repeats` Durchgänge. */
export interface Interval {
  workSeconds: number;
  restSeconds: number;
  repeats: number;
}

/** Geloggte Einheit (Cardio oder Zusatzsport). */
export interface Activity {
  id: string;
  date: LocalDate;
  type: ActivityType;
  durationSeconds: number;
  distanceMeters: number | null;
  avgHeartRate: number | null;
  zone: HeartRateZone | null;
  intensity: Intensity;
  intervals: Interval | null;
  note: string | null;
  /** Ende der Einheit. */
  endedAt: Date;
}

export function isActivityType(value: unknown): value is ActivityType {
  return typeof value === "string" && (ACTIVITY_TYPES as readonly string[]).includes(value);
}

export type CardioActivityType = (typeof CARDIO_ACTIVITY_TYPES)[number];

export function isCardioActivityType(value: unknown): value is CardioActivityType {
  return typeof value === "string" && (CARDIO_ACTIVITY_TYPES as readonly string[]).includes(value);
}

export function isHeartRateZone(value: unknown): value is HeartRateZone {
  return typeof value === "number" && (HEART_RATE_ZONES as readonly number[]).includes(value);
}

export function isIntensity(value: unknown): value is Intensity {
  return typeof value === "string" && (INTENSITIES as readonly string[]).includes(value);
}

/** Gesamtdauer eines Intervallblocks in Sekunden (Belastung und Pause je Durchgang). */
export function intervalSeconds(interval: Interval): number {
  return (interval.workSeconds + interval.restSeconds) * interval.repeats;
}

/** Sportarten, die vor allem die Beine belasten (für die Plan-Erstellung). */
export const LEG_DOMINANT_ACTIVITIES: readonly ActivityType[] = ["running", "cycling", "hiking", "football", "skiing", "team_sport"];
