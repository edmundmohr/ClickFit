/**
 * Übungskatalog eines Nutzers: eingebaute Bibliothek plus eigene Übungen.
 */
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { customExercise } from "@/db/schema";
import {
  EXERCISE_TYPES,
  MECHANICS,
  MOVEMENT_PATTERNS,
  isEquipment,
  isMuscle,
  isOneOfExerciseValues,
  type Exercise,
} from "@/domain/exercises/types";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/tokens";
import { findExercise, getCatalog } from "../catalog";
import type { CustomExerciseInput } from "../schemas";

export const CUSTOM_PREFIX = "custom-";

export function isCustomExerciseId(id: string): boolean {
  return id.startsWith(CUSTOM_PREFIX);
}

type CustomRow = typeof customExercise.$inferSelect;

function toExercise(row: CustomRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    type: isOneOfExerciseValues(EXERCISE_TYPES, row.type) ? row.type : "weight_reps",
    mechanic: isOneOfExerciseValues(MECHANICS, row.mechanic) ? row.mechanic : "isolation",
    pattern: isOneOfExerciseValues(MOVEMENT_PATTERNS, row.pattern) ? row.pattern : "core_stability",
    primary: row.primary.filter(isMuscle),
    secondary: row.secondary.filter(isMuscle),
    equipment: row.equipment.filter(isEquipment),
    // Eigene Übungen sind für jede Erfahrungsstufe wählbar und gelten als gute Variante.
    difficulty: "beginner",
    priority: 2,
    instructions: row.note ? row.note.split("\n").filter((line) => line.trim() !== "") : [],
    // Fehler und Kurzbefehle gibt es nur für die eingebaute Bibliothek.
    mistakes: [],
    cues: [],
    custom: true,
    archived: row.archivedAt !== null,
  };
}

export interface UserCatalog {
  /** Alle wählbaren Übungen (ohne gelöschte eigene). */
  all: readonly Exercise[];
  /** Findet auch gelöschte eigene Übungen, damit der Verlauf vollständig bleibt. */
  find: (exerciseId: string) => Exercise | null;
}

export async function getUserCatalog(db: AppDatabase, userId: string): Promise<UserCatalog> {
  const rows = await db.query.customExercise.findMany({ where: eq(customExercise.userId, userId) });
  const custom = rows.map(toExercise);
  const byId = new Map(custom.map((exercise) => [exercise.id, exercise]));
  return {
    all: [...getCatalog(), ...custom.filter((exercise) => !exercise.archived)],
    find: (exerciseId) => findExercise(exerciseId) ?? byId.get(exerciseId) ?? null,
  };
}

function toValues(input: CustomExerciseInput) {
  return {
    name: input.name,
    type: input.type,
    mechanic: input.mechanic,
    pattern: input.pattern,
    primary: input.primary,
    secondary: input.secondary.filter((muscle) => !input.primary.includes(muscle)),
    equipment: input.equipment,
    note: input.note || null,
  };
}

export async function createCustomExercise(
  db: AppDatabase,
  userId: string,
  input: CustomExerciseInput,
  now = new Date(),
): Promise<string> {
  const id = `${CUSTOM_PREFIX}${newId()}`;
  await db.insert(customExercise).values({ id, userId, ...toValues(input), createdAt: now, updatedAt: now });
  return id;
}

async function getOwned(db: AppDatabase, userId: string, exerciseId: string): Promise<CustomRow> {
  const row = await db.query.customExercise.findFirst({
    where: and(eq(customExercise.id, exerciseId), eq(customExercise.userId, userId)),
  });
  if (!row || row.archivedAt !== null) throw new AppError("NOT_FOUND");
  return row;
}

export async function getCustomExercise(db: AppDatabase, userId: string, exerciseId: string): Promise<Exercise> {
  return toExercise(await getOwned(db, userId, exerciseId));
}

export async function updateCustomExercise(
  db: AppDatabase,
  userId: string,
  exerciseId: string,
  input: CustomExerciseInput,
  now = new Date(),
): Promise<void> {
  await getOwned(db, userId, exerciseId);
  await db
    .update(customExercise)
    .set({ ...toValues(input), updatedAt: now })
    .where(eq(customExercise.id, exerciseId));
}

/** Löscht eine eigene Übung aus der Auswahl. Bereits geloggte Trainings behalten sie. */
export async function archiveCustomExercise(
  db: AppDatabase,
  userId: string,
  exerciseId: string,
  now = new Date(),
): Promise<void> {
  await getOwned(db, userId, exerciseId);
  await db.update(customExercise).set({ archivedAt: now, updatedAt: now }).where(eq(customExercise.id, exerciseId));
}
