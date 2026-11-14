import { BASIC_FOODS, BASIC_FOODS_BY_ID } from "@/data/foods";
import type { BasicFood, FoodItem } from "@/domain/nutrition/types";

export const BASIC_PREFIX = "basic:";
export const RECIPE_PREFIX = "recipe:";

export function basicToFoodItem(food: BasicFood): FoodItem {
  return {
    ref: `${BASIC_PREFIX}${food.id}`,
    source: "basic",
    name: food.name,
    brand: null,
    basis: food.basis,
    per: { kcal: food.kcal, proteinG: food.proteinG, carbsG: food.carbsG, fatG: food.fatG },
    servingSize: food.servingSize ?? null,
    servingLabel: food.servingLabel ?? null,
    barcode: null,
  };
}

export function findBasicFood(ref: string): FoodItem | null {
  if (!ref.startsWith(BASIC_PREFIX)) return null;
  const food = BASIC_FOODS_BY_ID.get(ref.slice(BASIC_PREFIX.length));
  return food ? basicToFoodItem(food) : null;
}

/** Zerlegt die Suche in Wörter; ein Treffer muss alle enthalten. */
export function searchTokens(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesTokens(text: string, tokens: readonly string[]): boolean {
  const haystack = text.toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/** Suche in den eingebauten Grundnahrungsmitteln; Treffer am Wortanfang zuerst. */
export function searchBasicFoods(query: string, limit: number): FoodItem[] {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];
  const first = tokens[0];
  return BASIC_FOODS.filter((food) => matchesTokens(food.name, tokens))
    .sort((a, b) => {
      const aStarts = a.name.toLowerCase().startsWith(first) ? 0 : 1;
      const bStarts = b.name.toLowerCase().startsWith(first) ? 0 : 1;
      return aStarts - bStarts || a.name.length - b.name.length || a.name.localeCompare(b.name, "de");
    })
    .slice(0, limit)
    .map(basicToFoodItem);
}
