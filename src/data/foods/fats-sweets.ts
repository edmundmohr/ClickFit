/** Fette, Öle, Süßes und Knabbereien: Durchschnittswerte pro 100 g. */
import type { BasicFood } from "@/domain/nutrition/types";

export const FATS_SWEETS_FOODS: BasicFood[] = [
  { id: "olive-oil", name: "Olivenöl", category: "fats", basis: "g", kcal: 884, proteinG: 0, carbsG: 0, fatG: 100, servingSize: 10, servingLabel: "1 EL (10 g)" },
  { id: "rapeseed-oil", name: "Rapsöl", category: "fats", basis: "g", kcal: 884, proteinG: 0, carbsG: 0, fatG: 100, servingSize: 10, servingLabel: "1 EL (10 g)" },
  { id: "sunflower-oil", name: "Sonnenblumenöl", category: "fats", basis: "g", kcal: 884, proteinG: 0, carbsG: 0, fatG: 100, servingSize: 10, servingLabel: "1 EL (10 g)" },
  { id: "coconut-oil", name: "Kokosöl", category: "fats", basis: "g", kcal: 890, proteinG: 0, carbsG: 0, fatG: 99, servingSize: 10, servingLabel: "1 EL (10 g)" },
  { id: "butter", name: "Butter", category: "fats", basis: "g", kcal: 745, proteinG: 0.7, carbsG: 0.6, fatG: 82.5, servingSize: 10, servingLabel: "1 Portion (10 g)" },
  { id: "margarine", name: "Margarine", category: "fats", basis: "g", kcal: 720, proteinG: 0.2, carbsG: 0.4, fatG: 80, servingSize: 10, servingLabel: "1 Portion (10 g)" },
  { id: "mayonnaise", name: "Mayonnaise (80 % Fett)", category: "fats", basis: "g", kcal: 725, proteinG: 1.2, carbsG: 2, fatG: 79, servingSize: 15, servingLabel: "1 EL (15 g)" },
  { id: "pesto-green", name: "Pesto (Basilikum)", category: "fats", basis: "g", kcal: 460, proteinG: 5, carbsG: 6, fatG: 46, servingSize: 20, servingLabel: "1 EL (20 g)" },

  { id: "chocolate-dark", name: "Zartbitterschokolade (70 % Kakao)", category: "sweets", basis: "g", kcal: 570, proteinG: 8.5, carbsG: 33, fatG: 42, servingSize: 25, servingLabel: "1 Portion (25 g)" },
  { id: "chocolate-milk", name: "Vollmilchschokolade", category: "sweets", basis: "g", kcal: 535, proteinG: 7, carbsG: 57, fatG: 31, servingSize: 25, servingLabel: "1 Portion (25 g)" },
  { id: "honey", name: "Honig", category: "sweets", basis: "g", kcal: 320, proteinG: 0.3, carbsG: 80, fatG: 0, servingSize: 20, servingLabel: "1 EL (20 g)" },
  { id: "sugar", name: "Zucker", category: "sweets", basis: "g", kcal: 400, proteinG: 0, carbsG: 100, fatG: 0, servingSize: 5, servingLabel: "1 TL (5 g)" },
  { id: "jam", name: "Marmelade", category: "sweets", basis: "g", kcal: 250, proteinG: 0.4, carbsG: 60, fatG: 0.2, servingSize: 20, servingLabel: "1 EL (20 g)" },
  { id: "hazelnut-chocolate-spread", name: "Nuss-Nougat-Creme", category: "sweets", basis: "g", kcal: 540, proteinG: 6.5, carbsG: 57, fatG: 31, servingSize: 15, servingLabel: "1 Portion (15 g)" },
  { id: "butter-biscuits", name: "Butterkekse", category: "sweets", basis: "g", kcal: 440, proteinG: 8, carbsG: 74, fatG: 12, servingSize: 5, servingLabel: "1 Keks" },
  { id: "gummy-bears", name: "Gummibärchen", category: "sweets", basis: "g", kcal: 343, proteinG: 6.9, carbsG: 77, fatG: 0.2, servingSize: 25, servingLabel: "1 Handvoll (25 g)" },
  { id: "ice-cream-vanilla", name: "Eiscreme (Vanille)", category: "sweets", basis: "g", kcal: 200, proteinG: 3.5, carbsG: 23, fatG: 10.5, servingSize: 50, servingLabel: "1 Kugel (50 g)" },
  { id: "pound-cake", name: "Rührkuchen (Marmorkuchen)", category: "sweets", basis: "g", kcal: 400, proteinG: 6, carbsG: 48, fatG: 20, servingSize: 70, servingLabel: "1 Stück (70 g)" },
  { id: "croissant", name: "Croissant", category: "sweets", basis: "g", kcal: 405, proteinG: 8, carbsG: 44, fatG: 21.5, servingSize: 60, servingLabel: "1 Croissant" },
  { id: "vanilla-pudding", name: "Vanillepudding", category: "sweets", basis: "g", kcal: 105, proteinG: 3, carbsG: 16, fatG: 3, servingSize: 150, servingLabel: "1 Becher (150 g)" },
  { id: "potato-chips", name: "Kartoffelchips", category: "sweets", basis: "g", kcal: 535, proteinG: 6, carbsG: 50, fatG: 34, servingSize: 30, servingLabel: "1 Portion (30 g)" },
  { id: "pretzel-sticks", name: "Salzstangen", category: "sweets", basis: "g", kcal: 385, proteinG: 10.5, carbsG: 74, fatG: 4.5, servingSize: 30, servingLabel: "1 Portion (30 g)" },
  { id: "granola-bar", name: "Müsliriegel", category: "sweets", basis: "g", kcal: 420, proteinG: 6.5, carbsG: 62, fatG: 15, servingSize: 25, servingLabel: "1 Riegel (25 g)" },
];
