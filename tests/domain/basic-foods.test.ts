import { describe, expect, it } from "vitest";
import { BASIC_FOODS } from "@/data/foods";
import { FOOD_CATEGORIES } from "@/domain/nutrition/types";

const MIN_FOODS = 150;
const MIN_PER_CATEGORY = 4;
/** Brennwerte der Makronährstoffe in kcal pro Gramm. */
const KCAL = { protein: 4, carbs: 4, fat: 9 };

describe("basic food catalogue", () => {
  it("contains enough foods with unique ids and names", () => {
    expect(BASIC_FOODS.length).toBeGreaterThanOrEqual(MIN_FOODS);
    const ids = BASIC_FOODS.map((food) => food.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    const names = BASIC_FOODS.map((food) => food.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("covers every category", () => {
    for (const category of FOOD_CATEGORIES) {
      const count = BASIC_FOODS.filter((food) => food.category === category).length;
      expect(count, category).toBeGreaterThanOrEqual(MIN_PER_CATEGORY);
    }
  });

  it("has plausible values per 100 g or 100 ml", () => {
    for (const food of BASIC_FOODS) {
      const label = food.id;
      expect(["g", "ml"], label).toContain(food.basis);
      expect(FOOD_CATEGORIES, label).toContain(food.category);
      expect(food.name.trim().length, label).toBeGreaterThan(1);
      for (const value of [food.kcal, food.proteinG, food.carbsG, food.fatG]) {
        expect(Number.isFinite(value), label).toBe(true);
        expect(value, label).toBeGreaterThanOrEqual(0);
      }
      expect(food.kcal, label).toBeLessThanOrEqual(900);
      expect(food.proteinG + food.carbsG + food.fatG, label).toBeLessThanOrEqual(100.5);
    }
  });

  it("has calories that match the macros", () => {
    for (const food of BASIC_FOODS) {
      const fromMacros = food.proteinG * KCAL.protein + food.carbsG * KCAL.carbs + food.fatG * KCAL.fat;
      // Ballaststoffe, Alkohol und Rundung erklären Abweichungen; grobe Fehler fallen trotzdem auf.
      const tolerance = Math.max(25, fromMacros * 0.2);
      const isAlcohol = food.category === "drinks" && food.kcal > fromMacros + tolerance;
      if (!isAlcohol) expect(Math.abs(food.kcal - fromMacros), food.id).toBeLessThanOrEqual(tolerance);
    }
  });

  it("describes servings completely", () => {
    for (const food of BASIC_FOODS) {
      const hasSize = food.servingSize !== undefined;
      const hasLabel = food.servingLabel !== undefined;
      expect(hasSize, food.id).toBe(hasLabel);
      if (food.servingSize !== undefined) {
        expect(food.servingSize, food.id).toBeGreaterThan(0);
        expect(food.servingSize, food.id).toBeLessThanOrEqual(1000);
      }
    }
  });
});
