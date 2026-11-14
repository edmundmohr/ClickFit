import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";
import { user } from "./auth";
import { workoutSession } from "./training";

/**
 * Fortschritt: Körperumfänge, Fortschrittsfotos, manuelle Erholungswerte und die
 * Anordnung des Dashboards. Das Körpergewicht liegt in `body_weight_entry` (Ernährung).
 */

const cascadeUser = () => text().notNull().references(() => user.id, { onDelete: "cascade" });
const timestamp = () => integer({ mode: "timestamp_ms" });

/** Ein Umfang pro Nutzer, Tag und Körperstelle; Werte in cm. */
export const bodyMeasurement = sqliteTable(
  "body_measurement",
  {
    userId: cascadeUser(),
    date: text().notNull(),
    site: text().notNull(),
    valueCm: real().notNull(),
    createdAt: timestamp().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.site, table.date] })],
);

/** Fortschrittsfoto. Die Datei liegt im privaten R2-Bucket unter `r2Key`. */
export const progressPhoto = sqliteTable(
  "progress_photo",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    date: text().notNull(),
    r2Key: text().notNull(),
    contentType: text().notNull(),
    sizeBytes: integer().notNull(),
    note: text(),
    sessionId: text().references(() => workoutSession.id, { onDelete: "set null" }),
    createdAt: timestamp().notNull(),
  },
  (table) => [index("progress_photo_user_date_idx").on(table.userId, table.date)],
);

/** Von Hand korrigierter Erholungswert einer Muskelgruppe; ersetzt die Berechnung ab `setAt`. */
export const recoveryOverride = sqliteTable(
  "recovery_override",
  {
    userId: cascadeUser(),
    muscle: text().notNull(),
    percent: integer().notNull(),
    setAt: timestamp().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.muscle] })],
);

/** Reihenfolge und Sichtbarkeit der Kacheln auf der Heute-Seite. */
export const dashboardSettings = sqliteTable("dashboard_settings", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  widgets: text({ mode: "json" }).$type<{ id: string; visible: boolean }[]>().notNull(),
  updatedAt: timestamp().notNull(),
});
