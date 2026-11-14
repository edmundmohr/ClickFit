import { sqliteTable, text, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * Offline-Synchronisierung und Web Push (Phase 6).
 */

const cascadeUser = () => text().notNull().references(() => user.id, { onDelete: "cascade" });
const timestamp = () => integer({ mode: "timestamp_ms" });

/**
 * Bereits verarbeitete Vorgänge aus der Offline-Warteschlange. Schickt ein Gerät denselben
 * Vorgang ein zweites Mal (z. B. nach einem Verbindungsabbruch), wird er nicht erneut ausgeführt.
 */
export const syncOperation = sqliteTable(
  "sync_operation",
  {
    userId: cascadeUser(),
    /** Kennung des Vorgangs, vom Gerät vergeben. */
    id: text().notNull(),
    processedAt: timestamp().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("sync_operation_processed_at_idx").on(table.processedAt),
  ],
);

/** Push-Abo eines Geräts (Web Push). Der Endpunkt gehört dem Push-Dienst des Browsers. */
export const pushSubscription = sqliteTable(
  "push_subscription",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    endpoint: text().notNull().unique(),
    p256dh: text().notNull(),
    auth: text().notNull(),
    createdAt: timestamp().notNull(),
  },
  (table) => [index("push_subscription_user_id_idx").on(table.userId)],
);

/**
 * Laufende Pause, für die eine Benachrichtigung geplant ist. Pro Nutzer höchstens eine:
 * Eine neue Pause ersetzt die alte, und eine verspätet eintreffende Nachricht mit altem
 * Kennzeichen wird verworfen.
 */
export const restTimer = sqliteTable("rest_timer", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text().notNull(),
  endsAt: timestamp().notNull(),
});
