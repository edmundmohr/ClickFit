/**
 * Puls-Zonen: Maximalpuls nach Tanaka und fünf Zonen als Anteil davon.
 */
import { HEART_RATE_ZONES, type HeartRateZone } from "./types";

/** Unter- und Obergrenze jeder Zone in Prozent des Maximalpulses. */
export const ZONE_PERCENTS: Record<HeartRateZone, readonly [number, number]> = {
  1: [50, 60],
  2: [60, 70],
  3: [70, 80],
  4: [80, 90],
  5: [90, 100],
};

/** Alter im laufenden Jahr; der Geburtstag selbst ist nicht bekannt. */
export function ageFromBirthYear(birthYear: number, currentYear: number): number {
  return Math.max(0, currentYear - birthYear);
}

/** Maximalpuls nach Tanaka: 208 − 0,7 × Alter. */
export function maxHeartRate(age: number): number {
  return Math.round(208 - 0.7 * age);
}

export interface HeartRateZoneRange {
  zone: HeartRateZone;
  minPercent: number;
  maxPercent: number;
  /** Bereich in Schlägen pro Minute, beide Grenzen eingeschlossen. */
  minBpm: number;
  maxBpm: number;
}

function lowerBound(zone: HeartRateZone, maxBpm: number): number {
  return Math.round((maxBpm * ZONE_PERCENTS[zone][0]) / 100);
}

/** Die fünf Zonen als lückenlose Bereiche: Jede Zone endet einen Schlag vor der nächsten. */
export function heartRateZones(maxBpm: number): HeartRateZoneRange[] {
  return HEART_RATE_ZONES.map((zone, index) => {
    const next = HEART_RATE_ZONES[index + 1];
    return {
      zone,
      minPercent: ZONE_PERCENTS[zone][0],
      maxPercent: ZONE_PERCENTS[zone][1],
      minBpm: lowerBound(zone, maxBpm),
      maxBpm: next === undefined ? maxBpm : lowerBound(next, maxBpm) - 1,
    };
  });
}

/** Zone zu einem Puls. Unterhalb von Zone 1 gibt es keine Zone; oberhalb des Maximalpulses gilt Zone 5. */
export function zoneForHeartRate(bpm: number, maxBpm: number): HeartRateZone | null {
  let result: HeartRateZone | null = null;
  for (const range of heartRateZones(maxBpm)) {
    if (bpm >= range.minBpm) result = range.zone;
  }
  return result;
}
