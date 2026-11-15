import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

/**
 * Trainingsdaten. Übungen aus der eingebauten Bibliothek werden nur über ihre Kennung
 * (`exerciseId`) referenziert: Der Katalog liegt im Code (src/data/exercises).
 * Gewichte werden immer in kg gespeichert und erst in der Anzeige umgerechnet.
 */

const cascadeUser = () => text().notNull().references(() => user.id, { onDelete: "cascade" });
const timestamp = () => integer({ mode: "timestamp_ms" });

/** Antworten aus dem Onboarding. Genau ein Datensatz pro Nutzer. */
export const userProfile = sqliteTable("user_profile", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  goal: text().notNull(),
  experience: text().notNull(),
  weekdays: text({ mode: "json" }).$type<number[]>().notNull(),
  sessionMinutes: integer().notNull(),
  cardio: text({ mode: "json" })
    .$type<{ wanted: boolean; types: string[]; sessionsPerWeek: number }>()
    .notNull(),
  sex: text().notNull(),
  birthYear: integer().notNull(),
  heightCm: real().notNull(),
  weightKg: real().notNull(),
  activityLevel: text().notNull(),
  injuries: text({ mode: "json" }).$type<string[]>().notNull(),
  injuryNote: text(),
  excludedExerciseIds: text({ mode: "json" }).$type<string[]>().notNull(),
  completedAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
});

/** Eigene Gewichtsstufen eines Geräts an einem Trainingsort, in der dort üblichen Einheit. */
export interface StoredWeightRule {
  equipment: string;
  unit: "kg" | "lbs";
  /** Kleinster Sprung in der Einheit der Regel; `null`, wenn eine feste Liste gilt. */
  increment: number | null;
  /** Feste Liste vorhandener Gewichte (z. B. Kurzhanteln); leer = beliebige Vielfache. */
  values: number[];
}

/** Vorhandene Scheiben einer Größe: Gewicht in der Scheiben-Einheit und Anzahl der Paare. */
export interface StoredPlate {
  weight: number;
  pairs: number;
}

/**
 * Trainingsort (Gym-Profil) mit Equipment, Stange, Scheiben und Gewichtsstufen.
 * Der Ort mit `isDefault` ist der aktuell aktive.
 */
export const gymProfile = sqliteTable(
  "gym_profile",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    type: text().notNull(),
    name: text(),
    equipment: text({ mode: "json" }).$type<string[]>().notNull(),
    isDefault: integer({ mode: "boolean" }).notNull().default(false),
    /** Einheit von Stange und Scheiben; `null` = Einheit aus den Einstellungen des Nutzers. */
    plateUnit: text(),
    /** Gewicht der Stange in der Scheiben-Einheit; `null` = Standardstange. */
    barWeight: real(),
    plates: text({ mode: "json" }).$type<StoredPlate[]>(),
    weightRules: text({ mode: "json" }).$type<StoredWeightRule[]>(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (table) => [index("gym_profile_user_id_idx").on(table.userId)],
);

/**
 * Trainingsplan mit seinen Routinen (Plantage). Status (`PLAN_STATUSES`): `active` = Hauptplan
 * (genau einer), `extra` = Zusatzplan, `saved` = inaktiv, `archived` = im Archiv.
 */
export const trainingPlan = sqliteTable(
  "training_plan",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    /** Name des Ordners; `null` bei erzeugten Plänen (Anzeige über den Split). */
    name: text(),
    split: text().notNull(),
    source: text().notNull().default("generated"),
    status: text().notNull().default("active"),
    /** Fester Trainingsort des Plans; `null` = Ort des Tages. */
    gymProfileId: text().references(() => gymProfile.id, { onDelete: "set null" }),
    /** Erster Tag des Plans als lokales Datum (YYYY-MM-DD); Basis für die Deload-Wochen. */
    startDate: text().notNull(),
    deloadEveryWeeks: integer().notNull(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (table) => [index("training_plan_user_status_idx").on(table.userId, table.status)],
);

export const planDay = sqliteTable(
  "plan_day",
  {
    id: text().primaryKey(),
    planId: text()
      .notNull()
      .references(() => trainingPlan.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    focus: text().notNull(),
    /** ISO-Wochentag 1–7; 0 = Routine ohne festen Tag. */
    weekday: integer().notNull(),
    /** Eigener Name der Routine; `null` = Anzeige über den Fokus. */
    name: text(),
  },
  (table) => [index("plan_day_plan_id_idx").on(table.planId)],
);

export const planExercise = sqliteTable(
  "plan_exercise",
  {
    id: text().primaryKey(),
    planDayId: text()
      .notNull()
      .references(() => planDay.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    exerciseId: text().notNull(),
    sets: integer().notNull(),
    repMin: integer().notNull(),
    repMax: integer().notNull(),
    targetRir: integer().notNull(),
    restSeconds: integer().notNull(),
    /** Übungen mit gleicher Kennung bilden einen Supersatz bzw. Zirkel. */
    groupId: text(),
    /** Selbst festgelegtes Zielgewicht in kg; `null` = automatisch aus der letzten Leistung. */
    targetWeightKg: real(),
    /** Wann das Zielgewicht zuletzt geändert wurde: Es gilt, bis danach trainiert wurde. */
    targetWeightSetAt: timestamp(),
  },
  (table) => [index("plan_exercise_plan_day_id_idx").on(table.planDayId)],
);

/** Verlauf der selbst festgelegten Zielgewichte je Übung (aus dem Routine-Editor). */
export const targetWeightChange = sqliteTable(
  "target_weight_change",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    exerciseId: text().notNull(),
    /** Routine, in der geändert wurde; bleibt als Name erhalten, auch wenn sie gelöscht wird. */
    planDayId: text().references(() => planDay.id, { onDelete: "set null" }),
    routineName: text(),
    /** Vorher und nachher in kg; `null` = automatisch (kein eigenes Zielgewicht). */
    fromKg: real(),
    toKg: real(),
    /** Lokales Datum der Änderung (YYYY-MM-DD, Europe/Berlin). */
    date: text().notNull(),
    changedAt: timestamp().notNull(),
  },
  (table) => [index("target_weight_change_user_exercise_idx").on(table.userId, table.exerciseId)],
);

export const workoutSession = sqliteTable(
  "workout_session",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    planId: text().references(() => trainingPlan.id, { onDelete: "set null" }),
    planDayId: text().references(() => planDay.id, { onDelete: "set null" }),
    /** Tagesfokus als Momentaufnahme, damit der Verlauf auch nach Planänderungen stimmt. */
    focus: text(),
    /** Name der Routine als Momentaufnahme. */
    name: text(),
    /** Trainingsort, an dem trainiert wurde (bestimmt Einheiten und Gewichtsstufen). */
    gymProfileId: text().references(() => gymProfile.id, { onDelete: "set null" }),
    /** Kurzvariante der Einheit (Zeitsparmodus). */
    isShort: integer({ mode: "boolean" }).notNull().default(false),
    /** Lokales Datum des Trainings (YYYY-MM-DD, Europe/Berlin). */
    date: text().notNull(),
    status: text().notNull().default("in_progress"),
    isDeload: integer({ mode: "boolean" }).notNull().default(false),
    startedAt: timestamp().notNull(),
    finishedAt: timestamp(),
    note: text(),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (table) => [
    index("workout_session_user_date_idx").on(table.userId, table.date),
    index("workout_session_user_status_idx").on(table.userId, table.status),
    // Höchstens ein offenes Workout pro Nutzer – auch wenn zwei Starts gleichzeitig ankommen.
    uniqueIndex("workout_session_one_open_per_user_idx")
      .on(table.userId)
      .where(sql`status = 'in_progress'`),
  ],
);

export const workoutExercise = sqliteTable(
  "workout_exercise",
  {
    id: text().primaryKey(),
    sessionId: text()
      .notNull()
      .references(() => workoutSession.id, { onDelete: "cascade" }),
    /** Bewusst doppelt gespeichert: beschleunigt „letzte Leistung dieser Übung“ pro Nutzer. */
    userId: cascadeUser(),
    position: integer().notNull(),
    exerciseId: text().notNull(),
    repMin: integer().notNull(),
    repMax: integer().notNull(),
    targetRir: integer().notNull(),
    restSeconds: integer().notNull(),
    groupId: text(),
    /** Abfrage nach dem letzten Satz: Anstrengung (`EFFORT_LEVELS`) und RIR, beides freiwillig. */
    effort: text(),
    effortRir: integer(),
  },
  (table) => [
    index("workout_exercise_session_id_idx").on(table.sessionId),
    index("workout_exercise_user_exercise_idx").on(table.userId, table.exerciseId),
  ],
);

export const workoutSet = sqliteTable(
  "workout_set",
  {
    id: text().primaryKey(),
    workoutExerciseId: text()
      .notNull()
      .references(() => workoutExercise.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    type: text().notNull().default("work"),
    targetWeightKg: real(),
    targetReps: integer(),
    weightKg: real(),
    reps: integer(),
    rir: integer(),
    durationSeconds: integer(),
    distanceMeters: real(),
    note: text(),
    completedAt: timestamp(),
  },
  (table) => [index("workout_set_workout_exercise_id_idx").on(table.workoutExerciseId)],
);

/** Dauerhafte Notiz pro Nutzer und Übung (z. B. Sitzeinstellung), erscheint bei jedem Training. */
export const exerciseNote = sqliteTable(
  "exercise_note",
  {
    userId: cascadeUser(),
    exerciseId: text().notNull(),
    note: text().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.exerciseId] })],
);
