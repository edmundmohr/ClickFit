import { sqliteTable, text, integer, real, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { progressPhoto } from "./progress";

/**
 * Integrationen und optionale KI (Phase 7): API-Token für den Health-Import, importierte
 * Gesundheitswerte sowie Zustimmung, Verbrauch und Ergebnisse der KI-Funktionen.
 */

const cascadeUser = () => text().notNull().references(() => user.id, { onDelete: "cascade" });
const timestamp = () => integer({ mode: "timestamp_ms" });

/**
 * API-Token eines Nutzers für den Import von außen (Health-Apps, Home Assistant).
 * Gespeichert wird nur der SHA-256-Hash; der Token selbst ist nur beim Anlegen sichtbar.
 */
export const apiToken = sqliteTable(
  "api_token",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    name: text().notNull(),
    tokenHash: text().notNull(),
    /** Anfang des Tokens zum Wiedererkennen in der Liste. */
    prefix: text().notNull(),
    createdAt: timestamp().notNull(),
    lastUsedAt: timestamp(),
  },
  (table) => [
    uniqueIndex("api_token_hash_idx").on(table.tokenHash),
    index("api_token_user_id_idx").on(table.userId),
  ],
);

/** Importierter Tageswert (Schritte, Ruhepuls). Ein Wert pro Nutzer, Art und Tag. */
export const healthMetric = sqliteTable(
  "health_metric",
  {
    userId: cascadeUser(),
    /** `steps` oder `resting_heart_rate`. */
    type: text().notNull(),
    /** Lokales Datum (YYYY-MM-DD). */
    date: text().notNull(),
    value: real().notNull(),
    /** `api` oder `csv`. */
    source: text().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.type, table.date] })],
);

/** Zustimmung zu den KI-Funktionen. Ohne Datensatz gehen keine Daten an den KI-Anbieter. */
export const aiConsent = sqliteTable("ai_consent", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  enabledAt: timestamp().notNull(),
});

/** Zähler der KI-Anfragen pro Nutzer und Tag (Kostenbremse). */
export const aiUsage = sqliteTable(
  "ai_usage",
  {
    userId: cascadeUser(),
    date: text().notNull(),
    count: integer().notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.date] })],
);

/** Grobe Körperfett-Schätzung der KI zu einem Fortschrittsfoto. */
export const bodyFatEstimate = sqliteTable(
  "body_fat_estimate",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    photoId: text()
      .notNull()
      .references(() => progressPhoto.id, { onDelete: "cascade" }),
    /** Datum des Fotos (YYYY-MM-DD). */
    date: text().notNull(),
    lowPercent: real().notNull(),
    highPercent: real().notNull(),
    note: text(),
    model: text().notNull(),
    createdAt: timestamp().notNull(),
  },
  (table) => [index("body_fat_estimate_user_date_idx").on(table.userId, table.date)],
);
