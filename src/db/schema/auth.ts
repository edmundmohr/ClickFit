import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * Tabellen, die Better Auth braucht (Kern + Username-Plugin + Rate-Limit in der Datenbank).
 * Die Property-Namen müssen den Feldnamen von Better Auth entsprechen; die Spalten heißen snake_case.
 */

export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: integer({ mode: "boolean" }).notNull().default(false),
  image: text(),
  createdAt: integer({ mode: "timestamp_ms" }).notNull(),
  updatedAt: integer({ mode: "timestamp_ms" }).notNull(),
  // Username-Plugin (Login per Benutzername; die E-Mail ist nur ein interner Platzhalter)
  username: text().notNull().unique(),
  displayUsername: text().notNull(),
  // Eigene Felder der App
  role: text().notNull().default("user"),
  theme: text().notNull().default("system"),
  unitSystem: text().notNull().default("metric"),
});

export const session = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    token: text().notNull().unique(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    updatedAt: integer({ mode: "timestamp_ms" }).notNull(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: integer({ mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer({ mode: "timestamp_ms" }),
    scope: text(),
    password: text(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    updatedAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("account_user_id_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: integer({ mode: "timestamp_ms" }).notNull(),
    createdAt: integer({ mode: "timestamp_ms" }).notNull(),
    updatedAt: integer({ mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const rateLimit = sqliteTable("rate_limit", {
  id: text().primaryKey(),
  key: text().notNull().unique(),
  count: integer().notNull(),
  lastRequest: integer().notNull(),
});
