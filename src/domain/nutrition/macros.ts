/**
 * Rechnen mit Nährwerten: Mengen umrechnen, summieren, Rezepte auswerten.
 */
import { ZERO_MACROS, type AmountUnit, type FoodBasis, type Macros } from "./types";

export interface Portionable {
  basis: FoodBasis;
  per: Macros;
  servingSize: number | null;
}

/** Welche Einheiten sich für ein Lebensmittel eintragen lassen. */
export function allowedUnits(food: Pick<Portionable, "basis" | "servingSize">): AmountUnit[] {
  if (food.basis === "serving") return ["serving"];
  return food.servingSize ? [food.basis, "serving"] : [food.basis];
}

/**
 * Faktor, mit dem die Basiswerte multipliziert werden. `null`, wenn die Einheit nicht
 * zum Lebensmittel passt (z. B. Gramm bei einem Produkt, das nur pro Portion bekannt ist).
 */
export function amountFactor(food: Pick<Portionable, "basis" | "servingSize">, amount: number, unit: AmountUnit): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (food.basis === "serving") return unit === "serving" ? amount : null;
  if (unit === food.basis) return amount / 100;
  if (unit === "serving" && food.servingSize) return (amount * food.servingSize) / 100;
  return null;
}

export function scaleMacros(macros: Macros, factor: number): Macros {
  return {
    kcal: macros.kcal * factor,
    proteinG: macros.proteinG * factor,
    carbsG: macros.carbsG * factor,
    fatG: macros.fatG * factor,
  };
}

/** Nährwerte einer Menge; `null`, wenn die Einheit nicht passt. */
export function macrosForAmount(food: Portionable, amount: number, unit: AmountUnit): Macros | null {
  const factor = amountFactor(food, amount, unit);
  return factor === null ? null : scaleMacros(food.per, factor);
}

export function sumMacros(items: readonly Macros[]): Macros {
  return items.reduce(
    (total, item) => ({
      kcal: total.kcal + item.kcal,
      proteinG: total.proteinG + item.proteinG,
      carbsG: total.carbsG + item.carbsG,
      fatG: total.fatG + item.fatG,
    }),
    ZERO_MACROS,
  );
}

export function roundMacros(macros: Macros): Macros {
  const round1 = (value: number) => Math.round(value * 10) / 10;
  return {
    kcal: Math.round(macros.kcal),
    proteinG: round1(macros.proteinG),
    carbsG: round1(macros.carbsG),
    fatG: round1(macros.fatG),
  };
}

export interface RecipeIngredientAmount extends Macros {
  amount: number;
  amountUnit: AmountUnit;
}

export interface RecipeSummary {
  total: Macros;
  perServing: Macros;
  /** Gesamtgewicht in g, wenn alle Zutaten in g oder ml angegeben sind; sonst `null`. */
  totalWeightG: number | null;
}

/**
 * Wertet ein Rezept aus. Das Gesamtgewicht ist nur bekannt, wenn jede Zutat in g oder ml
 * vorliegt (ml zählt näherungsweise als g); erst dann lässt sich nach Gramm eintragen.
 */
export function summarizeRecipe(ingredients: readonly RecipeIngredientAmount[], servings: number): RecipeSummary {
  const total = sumMacros(ingredients);
  const safeServings = servings > 0 ? servings : 1;
  const weighable = ingredients.length > 0 && ingredients.every((item) => item.amountUnit !== "serving");
  return {
    total,
    perServing: scaleMacros(total, 1 / safeServings),
    totalWeightG: weighable ? ingredients.reduce((sum, item) => sum + item.amount, 0) : null,
  };
}

/** Ein Rezept als „Lebensmittel“: pro 100 g, wenn das Gewicht bekannt ist, sonst pro Portion. */
export function recipeAsPortionable(summary: RecipeSummary, servings: number): Portionable {
  const safeServings = servings > 0 ? servings : 1;
  if (summary.totalWeightG && summary.totalWeightG > 0) {
    return {
      basis: "g",
      per: scaleMacros(summary.total, 100 / summary.totalWeightG),
      servingSize: summary.totalWeightG / safeServings,
    };
  }
  return { basis: "serving", per: summary.perServing, servingSize: null };
}
