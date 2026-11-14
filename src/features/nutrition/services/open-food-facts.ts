/**
 * Anbindung an Open Food Facts (https://world.openfoodfacts.org).
 * An den Dienst gehen nur Suchbegriff oder Barcode, keine Nutzerdaten.
 */
import type { FoodBasis, Macros } from "@/domain/nutrition/types";

const BASE_URL = "https://world.openfoodfacts.org";
const FIELDS = [
  "code",
  "product_name",
  "product_name_de",
  "brands",
  "quantity",
  "serving_size",
  "serving_quantity",
  "serving_quantity_unit",
  "nutrition_data_per",
  "nutriments",
].join(",");
const USER_AGENT = "ClickFit/1.0 (private fitness app)";
const KJ_PER_KCAL = 4.184;
const REQUEST_TIMEOUT_MS = 8000;
export const OFF_PAGE_SIZE = 20;

export interface OffProduct {
  barcode: string;
  name: string;
  brand: string | null;
  basis: FoodBasis;
  per: Macros;
  servingSize: number | null;
  servingLabel: string | null;
}

function asNumber(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : null;
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Wandelt ein Produkt aus der API in unser Format. Produkte ohne Namen oder ohne
 * Brennwert sind unbrauchbar und ergeben `null`.
 */
export function parseOffProduct(raw: unknown): OffProduct | null {
  if (!isRecord(raw)) return null;
  const barcode = asText(raw.code);
  const name = asText(raw.product_name_de) ?? asText(raw.product_name);
  const nutriments = isRecord(raw.nutriments) ? raw.nutriments : null;
  if (!barcode || !name || !nutriments) return null;

  const kcalDirect = asNumber(nutriments["energy-kcal_100g"]);
  const kj = asNumber(nutriments["energy_100g"]);
  const kcal = kcalDirect ?? (kj === null ? null : kj / KJ_PER_KCAL);
  if (kcal === null) return null;

  const quantity = asText(raw.quantity) ?? "";
  const isLiquid =
    raw.nutrition_data_per === "100ml" ||
    raw.serving_quantity_unit === "ml" ||
    /\d\s*(ml|cl|l)\b/i.test(quantity);
  const servingSize = asNumber(raw.serving_quantity);

  return {
    barcode,
    name: name.slice(0, 120),
    brand: asText(raw.brands)?.split(",")[0]?.trim().slice(0, 80) ?? null,
    basis: isLiquid ? "ml" : "g",
    per: {
      kcal: Math.round(kcal),
      proteinG: asNumber(nutriments["proteins_100g"]) ?? 0,
      carbsG: asNumber(nutriments["carbohydrates_100g"]) ?? 0,
      fatG: asNumber(nutriments["fat_100g"]) ?? 0,
    },
    servingSize: servingSize && servingSize > 0 ? servingSize : null,
    servingLabel: servingSize && servingSize > 0 ? (asText(raw.serving_size)?.slice(0, 60) ?? null) : null,
  };
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Open Food Facts responded with ${response.status}`);
  return response.json();
}

export async function searchOpenFoodFacts(query: string): Promise<OffProduct[]> {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(OFF_PAGE_SIZE),
    fields: FIELDS,
    lc: "de",
    cc: "de",
  });
  const data = await getJson(`${BASE_URL}/cgi/search.pl?${params.toString()}`);
  const products = isRecord(data) && Array.isArray(data.products) ? data.products : [];
  return products.flatMap((raw) => {
    const product = parseOffProduct(raw);
    return product ? [product] : [];
  });
}

export async function fetchOpenFoodFactsProduct(barcode: string): Promise<OffProduct | null> {
  const data = await getJson(`${BASE_URL}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${FIELDS}`);
  return isRecord(data) ? parseOffProduct(data.product) : null;
}
