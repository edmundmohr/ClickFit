/**
 * Gewichte werden intern immer in kg gespeichert. Diese Helfer rechnen für Anzeige und Eingabe um.
 */
export type UnitSystem = "metric" | "imperial";

export const KG_PER_LB = 0.45359237;

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Wert in der Einheit des Nutzers (kg oder lbs), auf höchstens zwei Nachkommastellen. */
export function toDisplayWeight(weightKg: number, unitSystem: UnitSystem): number {
  return unitSystem === "imperial" ? round(weightKg / KG_PER_LB, 1) : round(weightKg, 2);
}

/** Eingabe in der Einheit des Nutzers zurück nach kg. */
export function fromDisplayWeight(value: number, unitSystem: UnitSystem): number {
  return unitSystem === "imperial" ? round(value * KG_PER_LB, 3) : round(value, 3);
}

export function weightUnitKey(unitSystem: UnitSystem): "kg" | "lbs" {
  return unitSystem === "imperial" ? "lbs" : "kg";
}

/** Liest eine Zahl aus einem Eingabefeld; akzeptiert Komma und Punkt. Leere Eingabe ergibt null. */
export function parseDecimal(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (normalized === "") return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= 0 ? value : null;
}
