/**
 * Vollständiger Export der eigenen Daten als JSON. Enthält alles, was die App über den Nutzer
 * speichert – außer Zugangsdaten (Passwort-Hash, Sitzungen, Token-Hashes, Push-Schlüssel),
 * rein technischen Merkern (übertragene Offline-Vorgänge, laufender Pausen-Timer) und den
 * Bilddateien der Fotos (zu jedem Foto stehen die Angaben im Export).
 */
import { eq, inArray } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import type { AppDatabase } from "@/db/client";
import {
  activity,
  aiConsent,
  aiUsage,
  apiToken,
  bodyFatEstimate,
  bodyMeasurement,
  bodyWeightEntry,
  cardioPlanEntry,
  customExercise,
  dashboardSettings,
  exerciseNote,
  exercisePreference,
  food,
  foodLogEntry,
  gymProfile,
  healthMetric,
  mealPlanEntry,
  mobilityLog,
  nutritionSettings,
  nutritionTarget,
  planDay,
  planExercise,
  progressPhoto,
  recipe,
  recipeIngredient,
  recoveryOverride,
  supplement,
  supplementLog,
  trainingPlan,
  trainingSettings,
  userProfile,
  waterLog,
  workoutExercise,
  workoutSession,
  workoutSet,
} from "@/db/schema";

/** Kopie ohne das genannte Feld. */
function omit<Row extends object, Key extends keyof Row>(row: Row, key: Key): Omit<Row, Key> {
  const copy = { ...row };
  delete copy[key];
  return copy;
}

/** D1 erlaubt höchstens 100 gebundene Parameter pro Anweisung. */
const ID_CHUNK = 90;

/** Zeilen einer Tabelle, deren Spalte `column` zu einer der Kennungen passt (in Blöcken abgefragt). */
async function byParent<Table extends SQLiteTable>(
  db: AppDatabase,
  table: Table,
  column: SQLiteColumn,
  ids: readonly string[],
): Promise<Table["$inferSelect"][]> {
  const rows: Table["$inferSelect"][] = [];
  for (let index = 0; index < ids.length; index += ID_CHUNK) {
    const part = await db
      .select()
      .from(table as SQLiteTable)
      .where(inArray(column, ids.slice(index, index + ID_CHUNK)));
    rows.push(...(part as Table["$inferSelect"][]));
  }
  return rows;
}

export async function collectUserData(db: AppDatabase, userId: string) {
  const own = <Table extends SQLiteTable & { userId: SQLiteColumn }>(table: Table) =>
    db
      .select()
      .from(table as SQLiteTable)
      .where(eq(table.userId, userId)) as unknown as Promise<Table["$inferSelect"][]>;

  const [plans, sessions, exercises, recipes] = await Promise.all([
    own(trainingPlan),
    own(workoutSession),
    own(workoutExercise),
    own(recipe),
  ]);
  const days = await byParent(db, planDay, planDay.planId, plans.map((row) => row.id));
  const [planExercises, sets, ingredients] = await Promise.all([
    byParent(db, planExercise, planExercise.planDayId, days.map((row) => row.id)),
    byParent(db, workoutSet, workoutSet.workoutExerciseId, exercises.map((row) => row.id)),
    byParent(db, recipeIngredient, recipeIngredient.recipeId, recipes.map((row) => row.id)),
  ]);

  const [
    profile,
    gyms,
    settings,
    customExercises,
    preferences,
    exerciseNotes,
    activities,
    cardioPlan,
    mobility,
    foods,
    foodLog,
    mealPlan,
    targets,
    weights,
    water,
    nutrition,
    supplements,
    supplementLogs,
    measurements,
    photos,
    recovery,
    dashboard,
    health,
    bodyFat,
    consent,
    usage,
    tokens,
  ] = await Promise.all([
    own(userProfile),
    own(gymProfile),
    own(trainingSettings),
    own(customExercise),
    own(exercisePreference),
    own(exerciseNote),
    own(activity),
    own(cardioPlanEntry),
    own(mobilityLog),
    // Eigene Lebensmittel; die gemeinsame Datenbank (Open Food Facts) gehört nicht zum Nutzer.
    db.select().from(food).where(eq(food.ownerId, userId)),
    own(foodLogEntry),
    own(mealPlanEntry),
    own(nutritionTarget),
    own(bodyWeightEntry),
    own(waterLog),
    own(nutritionSettings),
    own(supplement),
    own(supplementLog),
    own(bodyMeasurement),
    own(progressPhoto),
    own(recoveryOverride),
    own(dashboardSettings),
    own(healthMetric),
    own(bodyFatEstimate),
    own(aiConsent),
    own(aiUsage),
    own(apiToken),
  ]);

  return {
    training: {
      profile,
      gyms,
      settings,
      plans,
      planDays: days,
      planExercises,
      workouts: sessions,
      workoutExercises: exercises,
      workoutSets: sets,
      customExercises,
      exercisePreferences: preferences,
      exerciseNotes,
    },
    activity: { activities, cardioPlan, mobility, health },
    nutrition: {
      customFoods: foods,
      foodLog,
      recipes,
      recipeIngredients: ingredients,
      mealPlan,
      targets,
      settings: nutrition,
      water,
      supplements,
      supplementLogs,
    },
    body: {
      weights,
      measurements,
      // Die Bilddateien selbst liegen im privaten Speicher und sind nicht Teil dieser Datei.
      photos: photos.map((photo) => omit(photo, "r2Key")),
      bodyFatEstimates: bodyFat,
      recoveryOverrides: recovery,
    },
    app: {
      dashboard,
      aiConsent: consent,
      // Zahl der KI-Anfragen je Tag.
      aiUsage: usage,
      // Von API-Tokens nur die Angaben zum Wiedererkennen, nie der Hash.
      apiTokens: tokens.map((token) => omit(token, "tokenHash")),
    },
  };
}

export type UserData = Awaited<ReturnType<typeof collectUserData>>;
