import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";
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

/** Trainingsort mit vorhandenem Equipment. Phase 5 erweitert dies zu vollen Gym-Profilen. */
export const gymProfile = sqliteTable(
  "gym_profile",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    type: text().notNull(),
    name: text(),
    equipment: text({ mode: "json" }).$type<string[]>().notNull(),
    isDefault: integer({ mode: "boolean" }).notNull().default(false),
    createdAt: timestamp().notNull(),
    updatedAt: timestamp().notNull(),
  },
  (table) => [index("gym_profile_user_id_idx").on(table.userId)],
);

export const trainingPlan = sqliteTable(
  "training_plan",
  {
    id: text().primaryKey(),
    userId: cascadeUser(),
    split: text().notNull(),
    source: text().notNull().default("generated"),
    status: text().notNull().default("active"),
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
    weekday: integer().notNull(),
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
  },
  (table) => [index("plan_exercise_plan_day_id_idx").on(table.planDayId)],
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
