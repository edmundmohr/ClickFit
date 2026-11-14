import { z } from "zod";
import { AMOUNT_UNITS, FOOD_BASES, MEALS } from "@/domain/nutrition/types";
import { isValidLocalDate } from "@/lib/dates";

export const localDateSchema = z.string().refine(isValidLocalDate);
const refSchema = z.string().min(1).max(120);
const amountSchema = z.number().positive().max(100000);
const weekdaySchema = z.number().int().min(1).max(7);
const macro = z.number().min(0).max(1000);

export const customFoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(80),
  basis: z.enum(FOOD_BASES),
  kcal: z.number().min(0).max(5000),
  proteinG: macro,
  carbsG: macro,
  fatG: macro,
  servingSize: z.number().positive().max(5000).nullable(),
  servingLabel: z.string().trim().max(60),
  barcode: z.string().trim().max(32),
});
export type CustomFoodInput = z.infer<typeof customFoodSchema>;

const amountFields = { foodRef: refSchema, amount: amountSchema, amountUnit: z.enum(AMOUNT_UNITS) };

/** Wohin ein gewähltes Lebensmittel eingetragen wird: Tagebuch, Rezept oder Wochenplan. */
export const addFoodSchema = z.discriminatedUnion("target", [
  z.object({ target: z.literal("log"), date: localDateSchema, meal: z.enum(MEALS), ...amountFields }),
  z.object({ target: z.literal("recipe"), recipeId: refSchema, ...amountFields }),
  z.object({ target: z.literal("plan"), weekday: weekdaySchema, meal: z.enum(MEALS), ...amountFields }),
]);
export type AddFoodInput = z.infer<typeof addFoodSchema>;

export const recipeSchema = z.object({
  name: z.string().trim().min(1).max(100),
  servings: z.number().positive().max(100),
});

export const targetSchema = z.object({
  kcal: z.number().int().min(800).max(8000),
  proteinG: z.number().int().min(0).max(600),
  carbsG: z.number().int().min(0).max(1500),
  fatG: z.number().int().min(0).max(500),
});
export type TargetInput = z.infer<typeof targetSchema>;

export const supplementSchema = z.object({
  name: z.string().trim().min(1).max(80),
  dose: z.string().trim().max(60),
  timing: z.enum(["morning", "pre_workout", "post_workout", "evening", "any"]),
});
export type SupplementInput = z.infer<typeof supplementSchema>;
export const SUPPLEMENT_TIMINGS = ["morning", "pre_workout", "post_workout", "evening", "any"] as const;
export type SupplementTiming = (typeof SUPPLEMENT_TIMINGS)[number];

export const waterAmountSchema = z.number().int().min(50).max(3000);
export const waterGoalSchema = z.number().int().min(500).max(8000);
export const weightSchema = z.number().min(30).max(400);
export const idSchema = z.string().min(1).max(80);
export const searchQuerySchema = z.string().trim().min(2).max(80);
export const barcodeSchema = z.string().regex(/^\d{6,14}$/);
