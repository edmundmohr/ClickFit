import { describe, expect, it } from "vitest";
import { parseOffProduct } from "@/features/nutrition/services/open-food-facts";

describe("Open Food Facts parsing", () => {
  it("reads a solid product with a serving", () => {
    expect(
      parseOffProduct({
        code: "4001234567890",
        product_name: "Oat Flakes",
        product_name_de: "Haferflocken zart",
        brands: "Kölln, Other",
        quantity: "500 g",
        serving_size: "40 g",
        serving_quantity: 40,
        nutriments: { "energy-kcal_100g": 372.4, proteins_100g: 13.5, carbohydrates_100g: 58.7, fat_100g: 7 },
      }),
    ).toEqual({
      barcode: "4001234567890",
      name: "Haferflocken zart",
      brand: "Kölln",
      basis: "g",
      per: { kcal: 372, proteinG: 13.5, carbsG: 58.7, fatG: 7 },
      servingSize: 40,
      servingLabel: "40 g",
    });
  });

  it("recognises drinks and converts kilojoules", () => {
    const product = parseOffProduct({
      code: "5449000000996",
      product_name: "Cola",
      quantity: "1,5 l",
      nutriments: { energy_100g: 180, carbohydrates_100g: "10.6" },
    });
    expect(product).toMatchObject({ basis: "ml", brand: null, servingSize: null, servingLabel: null });
    expect(product?.per).toEqual({ kcal: 43, proteinG: 0, carbsG: 10.6, fatG: 0 });
  });

  it("rejects products without a name, a barcode or calories", () => {
    const nutriments = { "energy-kcal_100g": 100 };
    expect(parseOffProduct({ code: "123456", nutriments })).toBeNull();
    expect(parseOffProduct({ product_name: "Nameless code", nutriments })).toBeNull();
    expect(parseOffProduct({ code: "123456", product_name: "No energy", nutriments: {} })).toBeNull();
    expect(parseOffProduct(null)).toBeNull();
    expect(parseOffProduct("text")).toBeNull();
  });

  it("ignores negative or malformed numbers", () => {
    const product = parseOffProduct({
      code: "123456",
      product_name: "Odd",
      serving_quantity: -5,
      nutriments: { "energy-kcal_100g": 50, proteins_100g: -3, fat_100g: "abc" },
    });
    expect(product?.per).toEqual({ kcal: 50, proteinG: 0, carbsG: 0, fatG: 0 });
    expect(product?.servingSize).toBeNull();
  });
});
