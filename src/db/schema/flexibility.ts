import { sqliteTable, text, integer, real, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * Flexibilität (Phase 5): Trainingsanpassungen, eigene Übungen, gelernte Vorlieben,
 * Cardio/Zusatzsport und Mobility.
 */

const cascadeUser = () => text().notNull().references(() => user.id, { onDelete: "cascade" });
const timestamp = () => integer({ mode: "timestamp_ms" });

export interface StoredVacation {
  /** `pause` = kein Training, `travel` = Training an einem anderen Ort. */
  type: "pause" | "travel";
  from: string;
  until: string;
  /** Ort für die Reise; nur bei `travel`. */
  gymProfileId: string | null;
}

export interface StoredCycle {
  enabled: boolean;
  /** Erster Tag der letzten Periode (YYYY-MM-DD). */
  lastStart: string;
  lengthDays: number;
}

export interface StoredExtraSport {
  type: string;
  sessionsPerWeek: number;
}

/** Schalter und Angaben, die den Plan beeinflussen. Genau ein Datensatz pro Nutzer. */
export const trainingSettings = sqliteTable("training_settings", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  recoveryMode: integer({ mode: "boolean" }).notNull().default(false),
  gripModule: integer({ mode: "boolean" }).notNull().default(false),
  /** Abfrage nach jeder Übung im Trainingsmodus (Anstrengung und RIR). */
  exerciseCheckIn: integer({ mode: "boolean" }).notNull().default(true),
  vacation: text({ mode: "json" }).$type<StoredVacation>(),
  cycle: text({ mode: "json" }).$type<StoredCycle>(),
  extraSports: text({ mode: "json" }).$type<StoredExtraSport[]>(),
  updatedAt: timestamp().notNull(),
});

/** Eigene Übung eines Nutzers. Die Kennung beginnt mit `custom-`. */
export const customExercise = sqliteTable(
  "custom_exercise",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    name: text().notNull(),
    type: text().notNull(),
    mechanic: text().notNull(),
    pattern: text().notNull(),
    primary: text({ mode: "json" }).$type<string[]>().notNull(),
    secondary: text({ mode: "json" }).$type<string[]>().notNull(),
    equipment: text({ mode: "json" }).$type<string[]>().notNull(),
    note: text(),
    /** Gelöschte Übungen bleiben für den Verlauf erhalten, erscheinen aber nirgends mehr zur Auswahl. */
    archivedAt: timestamp(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (table) => [index("custom_exercise_user_id_idx").on(table.userId)],
);

/** Was der Generator über Vorlieben lernt: getauschte und gelöschte Vorschläge je Übung. */
export const exercisePreference = sqliteTable(
  "exercise_preference",
  {
    userId: cascadeUser(),
    exerciseId: text().notNull(),
    swappedOut: integer().notNull().default(0),
    removed: integer().notNull().default(0),
    updatedAt: timestamp().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.exerciseId] })],
);

export interface StoredInterval {
  workSeconds: number;
  restSeconds: number;
  repeats: number;
}

/** Geloggte Cardio-Einheit oder Zusatzsport. Fließt in die Erholung ein. */
export const activity = sqliteTable(
  "activity",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    /** Lokales Datum (YYYY-MM-DD). */
    date: text().notNull(),
    type: text().notNull(),
    durationSeconds: integer().notNull(),
    distanceMeters: real(),
    avgHeartRate: integer(),
    /** Puls-Zone 1–5. */
    zone: integer(),
    /** Gefühlte Anstrengung: `easy`, `moderate` oder `hard`. */
    intensity: text().notNull().default("moderate"),
    intervals: text({ mode: "json" }).$type<StoredInterval>(),
    note: text(),
    /** `manual` oder `import` (Health-Import). */
    source: text().notNull().default("manual"),
    /** Kennung der Einheit in der Quelle; verhindert doppelte Importe. */
    externalId: text(),
    /** Ende der Einheit; ab hier klingt die Ermüdung ab. */
    endedAt: timestamp().notNull(),
    createdAt: timestamp().notNull(),
  },
  (table) => [
    index("activity_user_date_idx").on(table.userId, table.date),
    uniqueIndex("activity_user_external_idx").on(table.userId, table.externalId),
  ],
);

/** Geplante Cardio-Einheit pro Wochentag. */
export const cardioPlanEntry = sqliteTable(
  "cardio_plan_entry",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    /** ISO-Wochentag 1–7. */
    weekday: integer().notNull(),
    type: text().notNull(),
    minutes: integer().notNull(),
    zone: integer(),
    intervals: text({ mode: "json" }).$type<StoredInterval>(),
    note: text(),
    createdAt: timestamp().notNull(),
  },
  (table) => [index("cardio_plan_entry_user_id_idx").on(table.userId)],
);

/** Abgeschlossene Mobility-Routine. Die Routinen selbst liegen im Code (src/data/mobility). */
export const mobilityLog = sqliteTable(
  "mobility_log",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    routineId: text().notNull(),
    date: text().notNull(),
    durationSeconds: integer().notNull(),
    completedAt: timestamp().notNull(),
  },
  (table) => [index("mobility_log_user_date_idx").on(table.userId, table.date)],
);
