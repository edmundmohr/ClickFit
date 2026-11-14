/**
 * Lebensmittel aus allen Quellen: eingebaut, Open Food Facts (zwischengespeichert), eigene, Rezepte.
 */
import { and, asc, desc, eq, inArray, isNull, like, or } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { food } from "@/db/schema";
import { FOOD_BASES, FOOD_SOURCES, type FoodItem } from "@/domain/nutrition/types";
import { isOneOf } from "@/domain/training/types";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/tokens";
import { RECIPE_PREFIX, findBasicFood, searchBasicFoods, searchTokens } from "../food-catalog";
import type { CustomFoodInput } from "../schemas";
import { fetchOpenFoodFactsProduct, searchOpenFoodFacts, type OffProduct } from "./open-food-facts";
import { getRecipeAsFood } from "./recipe-service";

const SEARCH_LIMIT = 30;
const BASIC_LIMIT = 12;
/** D1 erlaubt höchstens 100 gebundene Parameter pro Anweisung. */
const FOOD_INSERT_CHUNK = 6;

type FoodRow = typeof food.$inferSelect;

export function rowToFoodItem(row: FoodRow): FoodItem {
  return {
    ref: row.id,
    source: isOneOf(FOOD_SOURCES, row.source) ? row.source : "custom",
    name: row.name,
    brand: row.brand,
    basis: isOneOf(FOOD_BASES, row.basis) ? row.basis : "g",
    per: { kcal: row.kcal, proteinG: row.proteinG, carbsG: row.carbsG, fatG: row.fatG },
    servingSize: row.servingSize,
    servingLabel: row.servingLabel,
    barcode: row.barcode,
  };
}

/** Sichtbar sind gemeinsame Produkte (ohne Besitzer) und die eigenen Lebensmittel. */
const visibleTo = (userId: string) => or(isNull(food.ownerId), eq(food.ownerId, userId));

export async function getFood(db: AppDatabase, userId: string, ref: string): Promise<FoodItem | null> {
  const basic = findBasicFood(ref);
  if (basic) return basic;
  if (ref.startsWith(RECIPE_PREFIX)) return getRecipeAsFood(db, userId, ref.slice(RECIPE_PREFIX.length));
  const row = await db.query.food.findFirst({ where: and(eq(food.id, ref), visibleTo(userId)) });
  return row ? rowToFoodItem(row) : null;
}

/** Suche ohne Netz: eigene Lebensmittel, eingebaute und bereits zwischengespeicherte Produkte. */
export async function searchLocalFoods(db: AppDatabase, userId: string, query: string): Promise<FoodItem[]> {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return [];
  const rows = await db.query.food.findMany({
    where: and(
      visibleTo(userId),
      ...tokens.map((token) => or(like(food.name, `%${token}%`), like(food.brand, `%${token}%`))),
    ),
    orderBy: [desc(food.ownerId), asc(food.name)],
    limit: SEARCH_LIMIT,
  });
  const own = rows.filter((row) => row.ownerId !== null).map(rowToFoodItem);
  const cached = rows.filter((row) => row.ownerId === null).map(rowToFoodItem);
  return [...own, ...searchBasicFoods(query, BASIC_LIMIT), ...cached].slice(0, SEARCH_LIMIT);
}

/** Speichert neue Produkte aus Open Food Facts; bekannte Barcodes bleiben unverändert. */
async function cacheOffProducts(db: AppDatabase, products: OffProduct[]): Promise<FoodItem[]> {
  if (products.length === 0) return [];
  const barcodes = [...new Set(products.map((product) => product.barcode))];
  const cachedWhere = and(eq(food.source, "off"), isNull(food.ownerId), inArray(food.barcode, barcodes));
  const existing = await db.query.food.findMany({ where: cachedWhere });
  const known = new Set(existing.map((row) => row.barcode));
  const now = new Date();
  const fresh = barcodes
    .filter((barcode) => !known.has(barcode))
    .flatMap((barcode) => products.find((product) => product.barcode === barcode) ?? [])
    .map((product) => ({
      id: newId(),
      source: "off",
      ownerId: null,
      barcode: product.barcode,
      name: product.name,
      brand: product.brand,
      basis: product.basis,
      ...product.per,
      servingSize: product.servingSize,
      servingLabel: product.servingLabel,
      createdAt: now,
      updatedAt: now,
    }));
  for (let index = 0; index < fresh.length; index += FOOD_INSERT_CHUNK) {
    await db.insert(food).values(fresh.slice(index, index + FOOD_INSERT_CHUNK));
  }
  const all = await db.query.food.findMany({ where: cachedWhere });
  const byBarcode = new Map(all.map((row) => [row.barcode, row]));
  return barcodes.flatMap((barcode) => {
    const row = byBarcode.get(barcode);
    return row ? [rowToFoodItem(row)] : [];
  });
}

/** Suche in Open Food Facts; die Treffer werden lokal zwischengespeichert. */
export async function searchRemoteFoods(db: AppDatabase, query: string): Promise<FoodItem[]> {
  return cacheOffProducts(db, await searchOpenFoodFacts(query));
}

/** Barcode nachschlagen: erst lokal (eigene und zwischengespeicherte), dann bei Open Food Facts. */
export async function findFoodByBarcode(db: AppDatabase, userId: string, barcode: string): Promise<FoodItem | null> {
  const local = await db.query.food.findFirst({
    where: and(eq(food.barcode, barcode), visibleTo(userId)),
    orderBy: desc(food.ownerId),
  });
  if (local) return rowToFoodItem(local);
  const product = await fetchOpenFoodFactsProduct(barcode);
  if (!product) return null;
  const [cached] = await cacheOffProducts(db, [product]);
  return cached ?? null;
}

export async function listCustomFoods(db: AppDatabase, userId: string): Promise<FoodItem[]> {
  const rows = await db.query.food.findMany({ where: eq(food.ownerId, userId), orderBy: asc(food.name) });
  return rows.map(rowToFoodItem);
}

export async function createCustomFood(db: AppDatabase, userId: string, input: CustomFoodInput): Promise<string> {
  const id = newId();
  const now = new Date();
  await db.insert(food).values({
    id,
    source: "custom",
    ownerId: userId,
    barcode: input.barcode || null,
    name: input.name,
    brand: input.brand || null,
    basis: input.basis,
    kcal: input.kcal,
    proteinG: input.proteinG,
    carbsG: input.carbsG,
    fatG: input.fatG,
    servingSize: input.basis === "serving" ? null : input.servingSize,
    servingLabel: input.servingLabel || null,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function deleteCustomFood(db: AppDatabase, userId: string, id: string): Promise<void> {
  const deleted = await db
    .delete(food)
    .where(and(eq(food.id, id), eq(food.ownerId, userId)))
    .returning({ id: food.id });
  if (deleted.length === 0) throw new AppError("NOT_FOUND");
}
