/**
 * Kleine Lesehilfen für ungeprüfte Eingaben (JSON und CSV).
 */
import { KG_PER_LB } from "@/lib/units";

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Zahl aus einer JSON-Zahl oder einem Text mit Dezimalpunkt oder -komma; sonst `null`. */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const text = value.trim().replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Kennung als Text; Zahlen werden übernommen, alles andere verworfen. */
export function toIdentifier(value: unknown): string | null {
  if (typeof value === "string") return value;
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

export type WeightUnit = "kg" | "lbs";

/** Erkennt die Einheit eines Gewichts aus Angaben wie `kg`, `lb`, `lbs` oder „Gewicht (lbs)“. */
export function weightUnitOf(text: string): WeightUnit | null {
  const normalized = text.toLowerCase();
  if (/\b(lbs?|pounds?|pfund)\b/.test(normalized)) return "lbs";
  return /\b(kg|kilogramm|kilograms?)\b/.test(normalized) ? "kg" : null;
}

export function toKg(value: number, unit: WeightUnit): number {
  return unit === "lbs" ? value * KG_PER_LB : value;
}

const METERS_PER_UNIT: Record<string, number> = { km: 1000, m: 1, mi: 1609.344 };

/** Strecke in Metern; unbekannte Einheiten ergeben `null`. */
export function toMeters(value: number, unit: string): number | null {
  const factor = METERS_PER_UNIT[unit.trim().toLowerCase()];
  return factor === undefined ? null : value * factor;
}
