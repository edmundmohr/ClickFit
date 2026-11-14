/** Eingebaute Grundnahrungsmittel: fasst alle Teillisten zusammen. */
import type { BasicFood } from "@/domain/nutrition/types";
import { DAIRY_EGGS_FOODS } from "./dairy-eggs";
import { DRINKS_READY_SUPPLEMENTS_FOODS } from "./drinks-ready-supplements";
import { FATS_SWEETS_FOODS } from "./fats-sweets";
import { FRUIT_NUTS_FOODS } from "./fruit-nuts";
import { GRAINS_BREAD_FOODS } from "./grains-bread";
import { LEGUMES_VEGETABLES_FOODS } from "./legumes-vegetables";
import { MEAT_FISH_FOODS } from "./meat-fish";

export const BASIC_FOODS: BasicFood[] = [
  ...GRAINS_BREAD_FOODS,
  ...DAIRY_EGGS_FOODS,
  ...MEAT_FISH_FOODS,
  ...LEGUMES_VEGETABLES_FOODS,
  ...FRUIT_NUTS_FOODS,
  ...FATS_SWEETS_FOODS,
  ...DRINKS_READY_SUPPLEMENTS_FOODS,
];

export const BASIC_FOODS_BY_ID: ReadonlyMap<string, BasicFood> = new Map(
  BASIC_FOODS.map((food) => [food.id, food]),
);
