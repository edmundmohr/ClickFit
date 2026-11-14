/**
 * Grundtypen der Ernährung. Reine Typen und Konstanten ohne Framework.
 */

export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

/**
 * Worauf sich die Nährwerte eines Lebensmittels beziehen:
 * - g: pro 100 g
 * - ml: pro 100 ml
 * - serving: pro Portion (z. B. ein Riegel), wenn kein Gewicht bekannt ist
 */
export const FOOD_BASES = ["g", "ml", "serving"] as const;
export type FoodBasis = (typeof FOOD_BASES)[number];

/** Einheit einer eingetragenen Menge. */
export const AMOUNT_UNITS = ["g", "ml", "serving"] as const;
export type AmountUnit = (typeof AMOUNT_UNITS)[number];

export interface Macros {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export const ZERO_MACROS: Macros = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

export const FOOD_SOURCES = ["basic", "off", "custom"] as const;
export type FoodSource = (typeof FOOD_SOURCES)[number];

/** Einheitliche Sicht auf ein Lebensmittel, egal aus welcher Quelle. */
export interface FoodItem {
  /** Eindeutige Referenz: `basic:<id>` für eingebaute, sonst die Datenbank-Kennung. */
  ref: string;
  source: FoodSource;
  name: string;
  brand: string | null;
  basis: FoodBasis;
  /** Nährwerte pro 100 g, pro 100 ml oder pro Portion (je nach `basis`). */
  per: Macros;
  /** Gewicht bzw. Volumen einer Portion in g/ml; `null`, wenn unbekannt. */
  servingSize: number | null;
  /** Beschreibung der Portion, z. B. „1 Scheibe“. */
  servingLabel: string | null;
  barcode: string | null;
}

export const FOOD_CATEGORIES = [
  "grains",
  "bread",
  "dairy",
  "meat",
  "fish",
  "eggs",
  "legumes",
  "vegetables",
  "fruit",
  "nuts",
  "fats",
  "sweets",
  "drinks",
  "ready",
  "supplements",
] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number];

/** Eingebautes Grundnahrungsmittel (Durchschnittswerte, keine Markenprodukte). */
export interface BasicFood {
  /** Stabile, englische Kennung in kebab-case, z. B. `oats-rolled`. */
  id: string;
  /** Deutscher Name, z. B. „Haferflocken“. */
  name: string;
  category: FoodCategory;
  /** `g` = Werte pro 100 g, `ml` = Werte pro 100 ml. */
  basis: "g" | "ml";
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Übliche Portion in g bzw. ml, z. B. 60 für ein Ei. */
  servingSize?: number;
  /** Bezeichnung der Portion auf Deutsch, z. B. „1 Ei (Größe M)“. */
  servingLabel?: string;
}

export function isMeal(value: unknown): value is Meal {
  return typeof value === "string" && (MEALS as readonly string[]).includes(value);
}
