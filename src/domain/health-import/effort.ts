/**
 * Schätzt Puls-Zone und Anstrengung einer importierten Einheit aus dem Durchschnittspuls.
 */
import type { HeartRateZone, Intensity } from "@/domain/cardio/types";
import { zoneForHeartRate } from "@/domain/cardio/zones";

export interface Effort {
  zone: HeartRateZone | null;
  intensity: Intensity;
}

/**
 * Ohne Puls oder Maximalpuls (kein Profil) gilt mittlere Anstrengung.
 * Zone 4–5 ist hart, Zone 2–3 mittel, Zone 1 und darunter leicht – wie beim Eintragen von Hand.
 */
export function estimateEffort(avgHeartRate: number | null, maxBpm: number | null): Effort {
  if (avgHeartRate === null || maxBpm === null) return { zone: null, intensity: "moderate" };
  const zone = zoneForHeartRate(avgHeartRate, maxBpm);
  if (zone === null || zone === 1) return { zone, intensity: "easy" };
  return { zone, intensity: zone >= 4 ? "hard" : "moderate" };
}
