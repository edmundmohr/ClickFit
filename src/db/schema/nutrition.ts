import { sqliteTable, text, integer, real, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * Ernährungsdaten. Eingebaute Grundnahrungsmittel liegen im Code (src/data/foods) und werden
 * über die Referenz `basic:<id>` angesprochen. Diese Tabellen halten Produkte aus
 * Open Food Facts (für alle Nutzer zwischengespeichert), eigene Lebensmittel und die Logs.
 */

const cascadeUser = () => text().notNull().references(() => user.id, { onDelete: "cascade" });
const timestamp = () => integer({ mode: "timestamp_ms" });

/** Open-Food-Facts-Produkte (ownerId leer, für alle sichtbar) und eigene Lebensmittel. */
export const food = sqliteTable(
  "food",
  {
    id: text().primaryKey(),
    source: text().notNull(),
    ownerId: text().references(() => user.id, { onDelete: "cascade" }),
    barcode: text(),
    name: text().notNull(),
    brand: text(),
    basis: text().notNull(),
    kcal: real().notNull(),
    proteinG: real().notNull(),
    carbsG: real().notNull(),
    fatG: real().notNull(),
    servingSize: real(),
    servingLabel: text(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (table) => [
    index("food_owner_id_idx").on(table.ownerId),
    index("food_barcode_idx").on(table.barcode),
    index("food_name_idx").on(table.name),
  ],
);

/** Ein Eintrag im Ernährungstagebuch. Nährwerte sind als Momentaufnahme gespeichert. */
export const foodLogEntry = sqliteTable(
  "food_log_entry",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    /** Lokales Datum (YYYY-MM-DD). */
    date: text().notNull(),
    meal: text().notNull(),
    /** `basic:<id>`, Kennung aus `food` oder `recipe:<id>`; dient „zuletzt/häufig genutzt“. */
    foodRef: text().notNull(),
    name: text().notNull(),
    amount: real().notNull(),
    amountUnit: text().notNull(),
    kcal: real().notNull(),
    proteinG: real().notNull(),
    carbsG: real().notNull(),
    fatG: real().notNull(),
    createdAt: timestamp().notNull(),
  },
  (table) => [
    index("food_log_entry_user_date_idx").on(table.userId, table.date),
    index("food_log_entry_user_ref_idx").on(table.userId, table.foodRef),
  ],
);

export const recipe = sqliteTable(
  "recipe",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    name: text().notNull(),
    /** Anzahl Portionen, die das Rezept ergibt. */
    servings: real().notNull().default(1),
    note: text(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (table) => [index("recipe_user_id_idx").on(table.userId)],
);

export const recipeIngredient = sqliteTable(
  "recipe_ingredient",
  {
    id: text().primaryKey(),
    recipeId: text()
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    foodRef: text().notNull(),
    name: text().notNull(),
    amount: real().notNull(),
    amountUnit: text().notNull(),
    kcal: real().notNull(),
    proteinG: real().notNull(),
    carbsG: real().notNull(),
    fatG: real().notNull(),
  },
  (table) => [index("recipe_ingredient_recipe_id_idx").on(table.recipeId)],
);

/** Wochenplan: Was an welchem Wochentag zu welcher Mahlzeit vorgesehen ist. */
export const mealPlanEntry = sqliteTable(
  "meal_plan_entry",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    weekday: integer().notNull(),
    meal: text().notNull(),
    foodRef: text().notNull(),
    name: text().notNull(),
    amount: real().notNull(),
    amountUnit: text().notNull(),
    kcal: real().notNull(),
    proteinG: real().notNull(),
    carbsG: real().notNull(),
    fatG: real().notNull(),
    createdAt: timestamp().notNull(),
  },
  (table) => [index("meal_plan_entry_user_weekday_idx").on(table.userId, table.weekday)],
);

/** Kalorien- und Makroziele mit Gültigkeit ab einem Datum; das jüngste gilt. */
export const nutritionTarget = sqliteTable(
  "nutrition_target",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    startDate: text().notNull(),
    kcal: integer().notNull(),
    proteinG: integer().notNull(),
    carbsG: integer().notNull(),
    fatG: integer().notNull(),
    /** formula = aus dem Profil berechnet, adaptive = wöchentlicher Check-in, manual = von Hand. */
    source: text().notNull(),
    /** Geschätzter Tagesverbrauch, auf dem das Ziel beruht. */
    tdeeKcal: integer(),
    createdAt: timestamp().notNull(),
  },
  (table) => [index("nutrition_target_user_date_idx").on(table.userId, table.startDate)],
);

export const bodyWeightEntry = sqliteTable(
  "body_weight_entry",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    date: text().notNull(),
    weightKg: real().notNull(),
    source: text().notNull().default("manual"),
    createdAt: timestamp().notNull(),
  },
  (table) => [uniqueIndex("body_weight_entry_user_date_idx").on(table.userId, table.date)],
);

export const waterLog = sqliteTable(
  "water_log",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    date: text().notNull(),
    amountMl: integer().notNull(),
    createdAt: timestamp().notNull(),
  },
  (table) => [index("water_log_user_date_idx").on(table.userId, table.date)],
);

/** Einstellungen zur Ernährung pro Nutzer. */
export const nutritionSettings = sqliteTable("nutrition_settings", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  waterGoalMl: integer().notNull(),
  updatedAt: timestamp().notNull(),
});

export const supplement = sqliteTable(
  "supplement",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    name: text().notNull(),
    dose: text(),
    timing: text().notNull().default("any"),
    createdAt: timestamp().notNull(),
  },
  (table) => [index("supplement_user_id_idx").on(table.userId)],
);

/** Ein Haken pro Präparat und Tag. */
export const supplementLog = sqliteTable(
  "supplement_log",
  {
    supplementId: text()
      .notNull()
      .references(() => supplement.id, { onDelete: "cascade" }),
    userId: cascadeUser(),
    date: text().notNull(),
    takenAt: timestamp().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.supplementId, table.date] }),
    index("supplement_log_user_date_idx").on(table.userId, table.date),
  ],
);
