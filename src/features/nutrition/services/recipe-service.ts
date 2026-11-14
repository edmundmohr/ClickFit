import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { food, foodLogEntry, recipe, recipeIngredient } from "@/db/schema";
import {
  recipeAsPortionable,
  recipeShare,
  scaleIngredients,
  summarizeRecipe,
  type RecipeSummary,
} from "@/domain/nutrition/macros";
import { AMOUNT_UNITS, type AmountUnit, type FoodItem, type Macros, type Meal } from "@/domain/nutrition/types";
import { isOneOf } from "@/domain/training/types";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { RECIPE_PREFIX, SNAPSHOT_PREFIX, findBasicFood } from "../food-catalog";

/** D1 erlaubt höchstens 100 gebundene Parameter pro Anweisung. */
const INGREDIENT_INSERT_CHUNK = 9;

export interface RecipeIngredientView extends Macros {
  id: string;
  foodRef: string;
  name: string;
  amount: number;
  amountUnit: AmountUnit;
  /** Gewicht einer Portion in g bei Zutaten nach Portionen; `null`, wenn unbekannt. */
  servingWeightG: number | null;
}

export interface RecipeView {
  id: string;
  name: string;
  servings: number;
  ingredients: RecipeIngredientView[];
  summary: RecipeSummary;
}

type IngredientRow = typeof recipeIngredient.$inferSelect;

function toIngredientView(row: IngredientRow, servingWeights: ReadonlyMap<string, number>): RecipeIngredientView {
  const amountUnit = isOneOf(AMOUNT_UNITS, row.amountUnit) ? row.amountUnit : "g";
  return {
    id: row.id,
    foodRef: row.foodRef,
    name: row.name,
    amount: row.amount,
    amountUnit,
    kcal: row.kcal,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    servingWeightG: amountUnit === "serving" ? (servingWeights.get(row.foodRef) ?? null) : null,
  };
}

/**
 * Portionsgewichte der Zutaten, die nach Portionen eingetragen sind (eingebaute Lebensmittel
 * aus dem Katalog, übrige aus der Datenbank). Ohne bekanntes Gewicht fehlt der Eintrag.
 */
async function getServingWeights(db: AppDatabase, userId: string, rows: readonly IngredientRow[]): Promise<Map<string, number>> {
  const refs = [...new Set(rows.filter((row) => row.amountUnit === "serving").map((row) => row.foodRef))];
  const weights = new Map<string, number>();
  const stored: string[] = [];
  for (const ref of refs) {
    const basic = findBasicFood(ref);
    if (basic) {
      if (basic.servingSize) weights.set(ref, basic.servingSize);
    } else if (!ref.startsWith(RECIPE_PREFIX) && !ref.startsWith(SNAPSHOT_PREFIX)) {
      stored.push(ref);
    }
  }
  if (stored.length > 0) {
    const foods = await db.query.food.findMany({
      columns: { id: true, servingSize: true },
      where: and(inArray(food.id, stored), or(isNull(food.ownerId), eq(food.ownerId, userId))),
    });
    for (const row of foods) {
      if (row.servingSize && row.servingSize > 0) weights.set(row.id, row.servingSize);
    }
  }
  return weights;
}

function toRecipeView(row: typeof recipe.$inferSelect, ingredients: IngredientRow[], weights: ReadonlyMap<string, number>): RecipeView {
  const own = ingredients.map((item) => toIngredientView(item, weights));
  return { id: row.id, name: row.name, servings: row.servings, ingredients: own, summary: summarizeRecipe(own, row.servings) };
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
  const weights = await getServingWeights(db, userId, ingredients);
  return recipes.map((row) =>
    toRecipeView(
      row,
      ingredients.filter((item) => item.recipeId === row.id),
      weights,
    ),
  );
}

export async function getRecipe(db: AppDatabase, userId: string, recipeId: string): Promise<RecipeView> {
  const row = await getOwnedRecipe(db, userId, recipeId);
  const ingredients = await db.query.recipeIngredient.findMany({
    where: eq(recipeIngredient.recipeId, recipeId),
    orderBy: asc(recipeIngredient.position),
  });
  return toRecipeView(row, ingredients, await getServingWeights(db, userId, ingredients));
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
  // Rezepte lassen sich nicht ineinander verschachteln.
  if (input.foodRef.startsWith(RECIPE_PREFIX)) throw new AppError("VALIDATION");
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

type LogRow = typeof foodLogEntry.$inferSelect;

/** Erlaubte Abweichung (Anteil) beim Auflösen eines Rezepts gegenüber dem Tagebucheintrag. */
const RESOLVE_TOLERANCE = 0.01;
type IngredientValues = Omit<IngredientRow, "id" | "recipeId" | "position">;

function snapshotOf(entry: LogRow, foodRef: string): IngredientValues {
  return {
    foodRef,
    name: entry.name,
    amount: entry.amount,
    amountUnit: entry.amountUnit,
    kcal: entry.kcal,
    proteinG: entry.proteinG,
    carbsG: entry.carbsG,
    fatG: entry.fatG,
  };
}

/**
 * Zutaten für einen Tagebucheintrag. Ein eingetragenes Rezept wird in seine Zutaten aufgelöst
 * (anteilig zur eingetragenen Menge), damit keine Rezepte in Rezepten entstehen. Lässt es sich
 * nicht auflösen (gelöscht, leer, Menge nicht umrechenbar) oder weicht es inzwischen von den
 * eingetragenen Nährwerten ab, wird der Eintrag als Momentaufnahme übernommen.
 */
async function ingredientsForEntry(db: AppDatabase, userId: string, entry: LogRow): Promise<IngredientValues[]> {
  if (!entry.foodRef.startsWith(RECIPE_PREFIX)) return [snapshotOf(entry, entry.foodRef)];
  const recipeId = entry.foodRef.slice(RECIPE_PREFIX.length);
  const snapshot = [snapshotOf(entry, `${SNAPSHOT_PREFIX}${recipeId}`)];
  const view = await getRecipe(db, userId, recipeId).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  });
  const unit = isOneOf(AMOUNT_UNITS, entry.amountUnit) ? entry.amountUnit : null;
  if (!view || view.ingredients.length === 0 || !unit) return snapshot;
  const share = recipeShare(view.summary, view.servings, entry.amount, unit);
  if (share === null || Math.abs(view.summary.total.kcal * share - entry.kcal) > Math.max(1, entry.kcal * RESOLVE_TOLERANCE)) {
    return snapshot;
  }
  return scaleIngredients(view.ingredients, share).map((item) => ({
    foodRef: item.foodRef,
    name: item.name,
    amount: item.amount,
    amountUnit: item.amountUnit,
    kcal: item.kcal,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatG: item.fatG,
  }));
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
  const values: IngredientValues[] = [];
  for (const entry of entries) values.push(...(await ingredientsForEntry(db, userId, entry)));
  const recipeId = await createRecipe(db, userId, { name: input.name, servings: 1 });
  const rows = values.map((item, position) => ({ id: newId(), recipeId, position, ...item }));
  for (let index = 0; index < rows.length; index += INGREDIENT_INSERT_CHUNK) {
    await db.insert(recipeIngredient).values(rows.slice(index, index + INGREDIENT_INSERT_CHUNK));
  }
  return recipeId;
}
