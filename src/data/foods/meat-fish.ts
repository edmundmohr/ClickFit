/** Fleisch, Wurst und Fisch: Durchschnittswerte pro 100 g. */
import type { BasicFood } from "@/domain/nutrition/types";

export const MEAT_FISH_FOODS: BasicFood[] = [
  { id: "chicken-breast-raw", name: "Hähnchenbrust (roh)", category: "meat", basis: "g", kcal: 110, proteinG: 23, carbsG: 0, fatG: 1.5, servingSize: 150, servingLabel: "1 Portion (150 g)" },
  { id: "chicken-breast-cooked", name: "Hähnchenbrust (gegart)", category: "meat", basis: "g", kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, servingSize: 120, servingLabel: "1 Portion (120 g)" },
  { id: "turkey-breast-raw", name: "Putenbrust (roh)", category: "meat", basis: "g", kcal: 107, proteinG: 24, carbsG: 0, fatG: 1, servingSize: 150, servingLabel: "1 Portion (150 g)" },
  { id: "chicken-thigh-raw", name: "Hähnchenschenkel (mit Haut, roh)", category: "meat", basis: "g", kcal: 190, proteinG: 18, carbsG: 0, fatG: 13 },
  { id: "beef-mince-raw", name: "Rinderhackfleisch (roh)", category: "meat", basis: "g", kcal: 220, proteinG: 20, carbsG: 0, fatG: 15.5, servingSize: 125, servingLabel: "1 Portion (125 g)" },
  { id: "beef-mince-lean-raw", name: "Rinderhackfleisch, mager (5 % Fett, roh)", category: "meat", basis: "g", kcal: 128, proteinG: 21, carbsG: 0, fatG: 5, servingSize: 125, servingLabel: "1 Portion (125 g)" },
  { id: "mixed-mince-raw", name: "Hackfleisch gemischt (roh)", category: "meat", basis: "g", kcal: 250, proteinG: 18, carbsG: 0, fatG: 20, servingSize: 125, servingLabel: "1 Portion (125 g)" },
  { id: "beef-steak-raw", name: "Rindersteak (roh)", category: "meat", basis: "g", kcal: 130, proteinG: 22, carbsG: 0, fatG: 4.5, servingSize: 200, servingLabel: "1 Steak (200 g)" },
  { id: "pork-fillet-raw", name: "Schweinefilet (roh)", category: "meat", basis: "g", kcal: 108, proteinG: 22, carbsG: 0, fatG: 2, servingSize: 150, servingLabel: "1 Portion (150 g)" },
  { id: "pork-schnitzel-raw", name: "Schweineschnitzel (natur, roh)", category: "meat", basis: "g", kcal: 110, proteinG: 22, carbsG: 0, fatG: 2.2, servingSize: 150, servingLabel: "1 Schnitzel (150 g)" },
  { id: "ham-cooked", name: "Kochschinken", category: "meat", basis: "g", kcal: 110, proteinG: 20, carbsG: 1, fatG: 3, servingSize: 20, servingLabel: "1 Scheibe" },
  { id: "turkey-breast-cold-cut", name: "Putenbrustaufschnitt", category: "meat", basis: "g", kcal: 105, proteinG: 21, carbsG: 1, fatG: 1.8, servingSize: 15, servingLabel: "1 Scheibe" },
  { id: "salami", name: "Salami", category: "meat", basis: "g", kcal: 370, proteinG: 20, carbsG: 1, fatG: 32, servingSize: 30, servingLabel: "1 Portion (30 g)" },
  { id: "bratwurst", name: "Bratwurst", category: "meat", basis: "g", kcal: 290, proteinG: 13, carbsG: 1, fatG: 26, servingSize: 100, servingLabel: "1 Bratwurst (100 g)" },
  { id: "wiener-sausage", name: "Wiener Würstchen", category: "meat", basis: "g", kcal: 280, proteinG: 13, carbsG: 1, fatG: 25, servingSize: 50, servingLabel: "1 Würstchen (50 g)" },
  { id: "bacon-raw", name: "Speck (Bacon, roh)", category: "meat", basis: "g", kcal: 320, proteinG: 15, carbsG: 0.5, fatG: 29, servingSize: 15, servingLabel: "1 Scheibe" },
  { id: "liver-sausage", name: "Leberwurst", category: "meat", basis: "g", kcal: 320, proteinG: 14, carbsG: 1.5, fatG: 28.5, servingSize: 25, servingLabel: "1 Portion (25 g)" },

  { id: "salmon-raw", name: "Lachs (roh)", category: "fish", basis: "g", kcal: 200, proteinG: 20, carbsG: 0, fatG: 13.5, servingSize: 125, servingLabel: "1 Filet (125 g)" },
  { id: "salmon-smoked", name: "Räucherlachs", category: "fish", basis: "g", kcal: 175, proteinG: 22, carbsG: 0, fatG: 9.5, servingSize: 25, servingLabel: "1 Scheibe" },
  { id: "tuna-canned-water", name: "Thunfisch (Dose, im eigenen Saft)", category: "fish", basis: "g", kcal: 110, proteinG: 25, carbsG: 0, fatG: 1, servingSize: 130, servingLabel: "1 Dose (130 g abgetropft)" },
  { id: "tuna-canned-oil", name: "Thunfisch (Dose, in Öl, abgetropft)", category: "fish", basis: "g", kcal: 190, proteinG: 26, carbsG: 0, fatG: 9.5, servingSize: 130, servingLabel: "1 Dose (130 g abgetropft)" },
  { id: "cod-raw", name: "Kabeljau (roh)", category: "fish", basis: "g", kcal: 80, proteinG: 18, carbsG: 0, fatG: 0.7, servingSize: 150, servingLabel: "1 Filet (150 g)" },
  { id: "pollock-raw", name: "Seelachs (roh)", category: "fish", basis: "g", kcal: 82, proteinG: 18.3, carbsG: 0, fatG: 0.9, servingSize: 150, servingLabel: "1 Filet (150 g)" },
  { id: "trout-raw", name: "Forelle (roh)", category: "fish", basis: "g", kcal: 115, proteinG: 20, carbsG: 0, fatG: 3.8, servingSize: 150, servingLabel: "1 Filet (150 g)" },
  { id: "shrimp-raw", name: "Garnelen (geschält, roh)", category: "fish", basis: "g", kcal: 85, proteinG: 19, carbsG: 0.3, fatG: 0.8, servingSize: 100, servingLabel: "1 Portion (100 g)" },
  { id: "herring-matjes", name: "Hering (Matjes)", category: "fish", basis: "g", kcal: 265, proteinG: 16, carbsG: 0, fatG: 22.5, servingSize: 80, servingLabel: "1 Doppelfilet (80 g)" },
  { id: "fish-fingers", name: "Fischstäbchen", category: "fish", basis: "g", kcal: 195, proteinG: 13, carbsG: 17, fatG: 8.5, servingSize: 30, servingLabel: "1 Stück" },
];
