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
  /** Gewicht einer Portion in g (bzw. ml) bei Zutaten nach Portionen; `null`/fehlend, wenn unbekannt. */
  servingWeightG?: number | null;
}

export interface RecipeSummary {
  total: Macros;
  perServing: Macros;
  /** Gesamtgewicht in g, wenn das Gewicht jeder Zutat bekannt ist; sonst `null`. */
  totalWeightG: number | null;
}

/** Gewicht einer Zutat in g; ml zählt näherungsweise als g. `null`, wenn unbekannt. */
function ingredientWeightG(item: RecipeIngredientAmount): number | null {
  if (item.amountUnit !== "serving") return item.amount;
  return item.servingWeightG && item.servingWeightG > 0 ? item.amount * item.servingWeightG : null;
}

/**
 * Wertet ein Rezept aus. Das Gesamtgewicht ist bekannt, wenn jede Zutat in g oder ml vorliegt
 * oder nach Portionen mit bekanntem Portionsgewicht (1 Ei = 60 g); erst dann lässt sich auch
 * nach Gramm eintragen.
 */
export function summarizeRecipe(ingredients: readonly RecipeIngredientAmount[], servings: number): RecipeSummary {
  const total = sumMacros(ingredients);
  const safeServings = servings > 0 ? servings : 1;
  const weights = ingredients.map(ingredientWeightG);
  const weighable = weights.length > 0 && weights.every((weight) => weight !== null);
  return {
    total,
    perServing: scaleMacros(total, 1 / safeServings),
    totalWeightG: weighable ? weights.reduce<number>((sum, weight) => sum + (weight ?? 0), 0) : null,
  };
}

/**
 * Welcher Anteil des ganzen Rezepts eine eingetragene Menge ist (1 = das ganze Rezept).
 * `null`, wenn sich die Menge nicht umrechnen lässt (z. B. Gramm ohne bekanntes Gewicht).
 */
export function recipeShare(summary: RecipeSummary, servings: number, amount: number, unit: AmountUnit): number | null {
  if (!Number.isFinite(amount) || amount < 0) return null;
  if (unit === "serving") return amount / (servings > 0 ? servings : 1);
  return summary.totalWeightG && summary.totalWeightG > 0 ? amount / summary.totalWeightG : null;
}

/** Zutaten eines Rezepts, anteilig auf eine Menge umgerechnet (Mengen und Nährwerte). */
export function scaleIngredients<T extends RecipeIngredientAmount>(ingredients: readonly T[], share: number): T[] {
  return ingredients.map((item) => ({ ...item, ...scaleMacros(item, share), amount: item.amount * share }));
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
