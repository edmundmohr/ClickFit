import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { foodLogEntry, recipe, recipeIngredient } from "@/db/schema";
import { recipeAsPortionable, summarizeRecipe, type RecipeSummary } from "@/domain/nutrition/macros";
import { AMOUNT_UNITS, type AmountUnit, type FoodItem, type Macros, type Meal } from "@/domain/nutrition/types";
import { isOneOf } from "@/domain/training/types";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { RECIPE_PREFIX } from "../food-catalog";

/** D1 erlaubt höchstens 100 gebundene Parameter pro Anweisung. */
const INGREDIENT_INSERT_CHUNK = 9;

export interface RecipeIngredientView extends Macros {
  id: string;
  name: string;
  amount: number;
  amountUnit: AmountUnit;
}

export interface RecipeView {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredientView[];
  summary: RecipeSummary;
}

type IngredientRow = typeof recipeIngredient.$inferSelect;

function toIngredientView(row: IngredientRow): RecipeIngredientView {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    amountUnit: isOneOf(AMOUNT_UNITS, row.amountUnit) ? row.amountUnit : "g",
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
  };
}

async function getOwnedRecipe(db: AppDatabase, userId: string, recipeId: string) {
  const row = await db.query.recipe.findFirst({ where: and(eq(recipe.id, recipeId), eq(recipe.userId, userId)) });
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

export async function listRecipes(db: AppDatabase, userId: string): Promise<RecipeView[]> {
  const recipes = await db.query.recipe.findMany({ where: eq(recipe.userId, userId), orderBy: asc(recipe.name) });
  if (recipes.length === 0) return [];
  const ingredients = await db.query.recipeIngredient.findMany({
    where: inArray(
      recipeIngredient.recipeId,
      recipes.map((row) => row.id),
    ),
    orderBy: asc(recipeIngredient.position),
  });
  return recipes.map((row) => {
    const own = ingredients.filter((item) => item.recipeId === row.id).map(toIngredientView);
    return { id: row.id, name: row.name, servings: row.servings, ingredients: own, summary: summarizeRecipe(own, row.servings) };
  });
}

export async function getRecipe(db: AppDatabase, userId: string, recipeId: string): Promise<RecipeView> {
  const row = await getOwnedRecipe(db, userId, recipeId);
  const ingredients = await db.query.recipeIngredient.findMany({
    where: eq(recipeIngredient.recipeId, recipeId),
    orderBy: asc(recipeIngredient.position),
  });
  const own = ingredients.map(toIngredientView);
  return { id: row.id, name: row.name, servings: row.servings, ingredients: own, summary: summarizeRecipe(own, row.servings) };
}

/** Ein Rezept als Lebensmittel zum Eintragen (nach Portionen, bei bekanntem Gewicht auch nach Gramm). */
export async function getRecipeAsFood(db: AppDatabase, userId: string, recipeId: string): Promise<FoodItem | null> {
  const view = await getRecipe(db, userId, recipeId).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!view || view.ingredients.length === 0) return null;
  const portionable = recipeAsPortionable(view.summary, view.servings);
  return {
    ref: `${RECIPE_PREFIX}${view.id}`,
    source: "custom",
    name: view.name,
    brand: null,
    ...portionable,
    servingLabel: null,
    barcode: null,
  };
}

export async function createRecipe(
  db: AppDatabase,
  userId: string,
  input: { name: string; servings: number },
): Promise<string> {
  const id = newId();
  const now = new Date();
  await db.insert(recipe).values({ id, userId, name: input.name, servings: input.servings, createdAt: now, updatedAt: now });
  return id;
}

export async function updateRecipe(
  db: AppDatabase,
  userId: string,
  recipeId: string,
  input: { name: string; servings: number },
): Promise<void> {
  await getOwnedRecipe(db, userId, recipeId);
  await db.update(recipe).set({ ...input, updatedAt: new Date() }).where(eq(recipe.id, recipeId));
}

export async function deleteRecipe(db: AppDatabase, userId: string, recipeId: string): Promise<void> {
  await getOwnedRecipe(db, userId, recipeId);
  await db.delete(recipe).where(eq(recipe.id, recipeId));
}

export interface IngredientInput extends Macros {
  foodRef: string;
  name: string;
  amount: number;
  amountUnit: AmountUnit;
}

export async function addRecipeIngredient(
  db: AppDatabase,
  userId: string,
  recipeId: string,
  input: IngredientInput,
): Promise<void> {
  await getOwnedRecipe(db, userId, recipeId);
  const [last] = await db
    .select({ position: recipeIngredient.position })
    .from(recipeIngredient)
    .where(eq(recipeIngredient.recipeId, recipeId))
    .orderBy(desc(recipeIngredient.position))
    .limit(1);
  await db.insert(recipeIngredient).values({ id: newId(), recipeId, position: (last?.position ?? -1) + 1, ...input });
}

export async function removeRecipeIngredient(db: AppDatabase, userId: string, ingredientId: string): Promise<void> {
  const row = await db.query.recipeIngredient.findFirst({ where: eq(recipeIngredient.id, ingredientId) });
  if (!row) throw new AppError("NOT_FOUND");
  await getOwnedRecipe(db, userId, row.recipeId);
  await db.delete(recipeIngredient).where(eq(recipeIngredient.id, ingredientId));
}

/** Speichert eine geloggte Mahlzeit als Rezept mit einer Portion (Vorlage zum Wiederverwenden). */
export async function createRecipeFromMeal(
  db: AppDatabase,
  userId: string,
  input: { date: LocalDate; meal: Meal; name: string },
): Promise<string> {
  const entries = await db.query.foodLogEntry.findMany({
    where: and(eq(foodLogEntry.userId, userId), eq(foodLogEntry.date, input.date), eq(foodLogEntry.meal, input.meal)),
    orderBy: asc(foodLogEntry.createdAt),
  });
  if (entries.length === 0) throw new AppError("NOT_FOUND");
  const recipeId = await createRecipe(db, userId, { name: input.name, servings: 1 });
  const rows = entries.map((entry, position) => ({
    id: newId(),
    recipeId,
    position,
    foodRef: entry.foodRef,
    name: entry.name,
    amount: entry.amount,
    amountUnit: entry.amountUnit,
    kcal: entry.kcal,
    proteinG: entry.proteinG,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
  }));
  for (let index = 0; index < rows.length; index += INGREDIENT_INSERT_CHUNK) {
    await db.insert(recipeIngredient).values(rows.slice(index, index + INGREDIENT_INSERT_CHUNK));
  }
  return recipeId;
}
