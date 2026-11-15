"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/server/context";
import { attempt, invalid, type ActionResult } from "@/lib/action-result";
import { toLocalDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { MEALS, type FoodItem } from "@/domain/nutrition/types";
import type { Weekday } from "@/domain/training/types";
import { requireUser } from "@/features/auth/session";
import {
  addFoodSchema,
  barcodeSchema,
  customFoodSchema,
  idSchema,
  localDateSchema,
  recipeSchema,
  searchQuerySchema,
  supplementSchema,
  targetSchema,
  waterAmountSchema,
  waterGoalSchema,
  weightSchema,
} from "./schemas";
import { addLogEntry, copyMeal, deleteLogEntry, resolveAmount, displayName, updateLogAmount } from "./services/diary-service";
import {
  createCustomFood,
  deleteCustomFood,
  findFoodByBarcode,
  getFood,
  searchLocalFoods,
  searchRemoteFoods,
} from "./services/food-service";
import { addPlanEntry, applyPlanDay, deletePlanEntry } from "./services/meal-plan-service";
import {
  addRecipeIngredient,
  createRecipe,
  createRecipeFromMeal,
  deleteRecipe,
  removeRecipeIngredient,
  updateRecipe,
} from "./services/recipe-service";
import { applyCheckIn, recalculateTarget, setManualTarget } from "./services/target-service";
import {
  addSupplement,
  addWater,
  deleteSupplement,
  deleteWeight,
  saveWeight,
  setSupplementTaken,
  setWaterGoal,
  undoLastWater,
} from "./services/tracking-service";
import { resolveTrackingDate } from "./tracking-date";

const NUTRITION_PATH = "/nutrition";
const mealSchema = z.enum(MEALS);
const refresh = () => revalidatePath("/", "layout");

export async function searchFoodsAction(query: string, remote: boolean): Promise<ActionResult<FoodItem[]>> {
  const user = await requireUser();
  const parsed = searchQuerySchema.safeParse(query);
  if (!parsed.success) return invalid;
  return attempt(() => (remote ? searchRemoteFoods(getDb(), parsed.data) : searchLocalFoods(getDb(), user.id, parsed.data)));
}

export async function lookupBarcodeAction(barcode: string): Promise<ActionResult<FoodItem | null>> {
  const user = await requireUser();
  const parsed = barcodeSchema.safeParse(barcode);
  if (!parsed.success) return invalid;
  return attempt(() => findFoodByBarcode(getDb(), user.id, parsed.data));
}

export async function getFoodAction(ref: string): Promise<ActionResult<FoodItem>> {
  const user = await requireUser();
  if (!z.string().min(1).max(120).safeParse(ref).success) return invalid;
  return attempt(async () => {
    const food = await getFood(getDb(), user.id, ref);
    if (!food) throw new AppError("NOT_FOUND");
    return food;
  });
}

/** Trägt ein Lebensmittel ins Tagebuch, in ein Rezept oder in den Wochenplan ein. */
export async function addFoodAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = addFoodSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const data = parsed.data;
  const result = await attempt(async () => {
    const db = getDb();
    if (data.target === "log") {
      await addLogEntry(db, user.id, data);
    } else if (data.target === "plan") {
      await addPlanEntry(db, user.id, data);
    } else {
      const { food, macros } = await resolveAmount(db, user.id, data);
      await addRecipeIngredient(db, user.id, data.recipeId, {
        foodRef: food.ref,
        name: displayName(food),
        amount: data.amount,
        amountUnit: data.amountUnit,
        ...macros,
      });
    }
  });
  refresh();
  return result;
}

export async function updateLogAmountAction(entryId: string, amount: number): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(entryId).success || !z.number().positive().max(100000).safeParse(amount).success) return invalid;
  const result = await attempt(() => updateLogAmount(getDb(), user.id, entryId, amount));
  refresh();
  return result;
}

export async function deleteLogEntryAction(entryId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(entryId).success) return invalid;
  const result = await attempt(() => deleteLogEntry(getDb(), user.id, entryId));
  refresh();
  return result;
}

export async function copyMealAction(fromDate: string, toDate: string, meal: string): Promise<ActionResult<number>> {
  const user = await requireUser();
  const parsed = z.object({ fromDate: localDateSchema, toDate: localDateSchema, meal: mealSchema }).safeParse({ fromDate, toDate, meal });
  if (!parsed.success) return invalid;
  const result = await attempt(() => copyMeal(getDb(), user.id, parsed.data));
  refresh();
  return result;
}

export async function saveMealAsRecipeAction(date: string, meal: string, name: string): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = z
    .object({ date: localDateSchema, meal: mealSchema, name: z.string().trim().min(1).max(100) })
    .safeParse({ date, meal, name });
  if (!parsed.success) return invalid;
  const result = await attempt(() => createRecipeFromMeal(getDb(), user.id, parsed.data));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function createCustomFoodAction(input: unknown): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = customFoodSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => createCustomFood(getDb(), user.id, parsed.data));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function deleteCustomFoodAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(id).success) return invalid;
  const result = await attempt(() => deleteCustomFood(getDb(), user.id, id));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function createRecipeAction(input: unknown): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = recipeSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => createRecipe(getDb(), user.id, parsed.data));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function updateRecipeAction(recipeId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = recipeSchema.safeParse(input);
  if (!idSchema.safeParse(recipeId).success || !parsed.success) return invalid;
  const result = await attempt(() => updateRecipe(getDb(), user.id, recipeId, parsed.data));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function deleteRecipeAction(recipeId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(recipeId).success) return invalid;
  const result = await attempt(() => deleteRecipe(getDb(), user.id, recipeId));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function removeIngredientAction(ingredientId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(ingredientId).success) return invalid;
  const result = await attempt(() => removeRecipeIngredient(getDb(), user.id, ingredientId));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function deletePlanEntryAction(entryId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(entryId).success) return invalid;
  const result = await attempt(() => deletePlanEntry(getDb(), user.id, entryId));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function applyPlanDayAction(weekday: number, date: string): Promise<ActionResult<number>> {
  const user = await requireUser();
  const parsed = z.object({ weekday: z.number().int().min(1).max(7), date: localDateSchema }).safeParse({ weekday, date });
  if (!parsed.success) return invalid;
  const result = await attempt(() => applyPlanDay(getDb(), user.id, parsed.data.weekday as Weekday, parsed.data.date));
  refresh();
  return result;
}

/** `date` = `null` bucht auf „heute“ zum Zeitpunkt des Klicks; zukünftige Tage sind gesperrt. */
export async function addWaterAction(date: string | null, amountMl: number): Promise<ActionResult> {
  const user = await requireUser();
  const day = resolveTrackingDate(date, toLocalDate(new Date()));
  if (!day || !waterAmountSchema.safeParse(amountMl).success) return invalid;
  const result = await attempt(() => addWater(getDb(), user.id, day, amountMl));
  refresh();
  return result;
}

export async function undoWaterAction(date: string | null): Promise<ActionResult> {
  const user = await requireUser();
  const day = resolveTrackingDate(date, toLocalDate(new Date()));
  if (!day) return invalid;
  const result = await attempt(() => undoLastWater(getDb(), user.id, day));
  refresh();
  return result;
}

export async function setWaterGoalAction(goalMl: number): Promise<ActionResult> {
  const user = await requireUser();
  if (!waterGoalSchema.safeParse(goalMl).success) return invalid;
  const result = await attempt(() => setWaterGoal(getDb(), user.id, goalMl));
  refresh();
  return result;
}

export async function addSupplementAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = supplementSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => addSupplement(getDb(), user.id, parsed.data));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function deleteSupplementAction(supplementId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(supplementId).success) return invalid;
  const result = await attempt(() => deleteSupplement(getDb(), user.id, supplementId));
  revalidatePath(NUTRITION_PATH, "layout");
  return result;
}

export async function toggleSupplementAction(supplementId: string, date: string, taken: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(supplementId).success || !localDateSchema.safeParse(date).success) return invalid;
  const result = await attempt(() => setSupplementTaken(getDb(), user.id, supplementId, date, taken));
  revalidatePath(NUTRITION_PATH);
  return result;
}

/** `date` = `null` speichert für „heute“ zum Zeitpunkt des Klicks; zukünftige Tage sind gesperrt. */
export async function saveWeightAction(date: string | null, weightKg: number): Promise<ActionResult> {
  const user = await requireUser();
  const day = resolveTrackingDate(date, toLocalDate(new Date()));
  if (!day || !weightSchema.safeParse(weightKg).success) return invalid;
  const result = await attempt(() => saveWeight(getDb(), user.id, day, weightKg));
  refresh();
  return result;
}

export async function deleteWeightAction(date: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!localDateSchema.safeParse(date).success) return invalid;
  const result = await attempt(() => deleteWeight(getDb(), user.id, date));
  refresh();
  return result;
}

export async function setManualTargetAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = targetSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => setManualTarget(getDb(), user.id, toLocalDate(new Date()), parsed.data));
  refresh();
  return result;
}

export async function recalculateTargetAction(): Promise<ActionResult> {
  const user = await requireUser();
  const result = await attempt(async () => {
    const targets = await recalculateTarget(getDb(), user.id, toLocalDate(new Date()));
    if (!targets) throw new AppError("PROFILE_REQUIRED");
  });
  refresh();
  return result;
}

export async function applyCheckInAction(): Promise<ActionResult> {
  const user = await requireUser();
  const result = await attempt(() => applyCheckIn(getDb(), user.id, toLocalDate(new Date())));
  refresh();
  return result;
}
