"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { attempt, invalid, type ActionResult } from "@/lib/action-result";
import { toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";
import { requireUser } from "@/features/auth/session";
import {
  customExerciseSchema,
  cycleSchema,
  extraSportsSchema,
  folderNameSchema,
  gymSchema,
  injuriesSchema,
  routineSchema,
  vacationSchema,
} from "./schemas";
import { archiveCustomExercise, createCustomExercise, updateCustomExercise } from "./services/exercise-service";
import { createGym, deleteGym, setActiveGym, updateGym } from "./services/gym-service";
import { PLAN_STATUSES } from "@/domain/training/plan-roles";
import {
  createFolder,
  createRoutine,
  deleteFolder,
  deleteRoutine,
  duplicateRoutine,
  renameFolder,
  saveRoutine,
  setPlanGym,
  setPlanStatus,
} from "./services/routine-service";
import { saveInjuries, saveTrainingSettings, setExerciseExcluded } from "./services/settings-service";

/**
 * Server Actions für die Flexibilität (Phase 5): Trainingsorte, eigene Übungen,
 * Plan-Builder und Trainingsanpassungen.
 */

const idSchema = z.string().min(1).max(80);
const refresh = () => revalidatePath("/", "layout");

export async function saveGymAction(gymId: string | null, input: unknown): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = gymSchema.safeParse(input);
  if (!parsed.success || (gymId !== null && !idSchema.safeParse(gymId).success)) return invalid;
  const result = await attempt(async () => {
    const db = getDb();
    if (gymId === null) return createGym(db, user.id, parsed.data);
    await updateGym(db, user.id, gymId, parsed.data);
    return gymId;
  });
  refresh();
  return result;
}

export async function setActiveGymAction(gymId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(gymId).success) return invalid;
  const result = await attempt(() => setActiveGym(getDb(), user.id, gymId));
  refresh();
  return result;
}

export async function deleteGymAction(gymId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(gymId).success) return invalid;
  const result = await attempt(() => deleteGym(getDb(), user.id, gymId));
  refresh();
  return result;
}

export async function saveCustomExerciseAction(exerciseId: string | null, input: unknown): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = customExerciseSchema.safeParse(input);
  if (!parsed.success || (exerciseId !== null && !idSchema.safeParse(exerciseId).success)) return invalid;
  const result = await attempt(async () => {
    const db = getDb();
    if (exerciseId === null) return createCustomExercise(db, user.id, parsed.data);
    await updateCustomExercise(db, user.id, exerciseId, parsed.data);
    return exerciseId;
  });
  refresh();
  return result;
}

export async function deleteCustomExerciseAction(exerciseId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(exerciseId).success) return invalid;
  const result = await attempt(() => archiveCustomExercise(getDb(), user.id, exerciseId));
  refresh();
  return result;
}

export async function setExerciseExcludedAction(exerciseId: string, excluded: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(exerciseId).success || typeof excluded !== "boolean") return invalid;
  const result = await attempt(() => setExerciseExcluded(getDb(), user.id, exerciseId, excluded));
  refresh();
  return result;
}

export async function createFolderAction(name: string): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = folderNameSchema.safeParse(name);
  if (!parsed.success) return invalid;
  const result = await attempt(() => createFolder(getDb(), user.id, parsed.data, toLocalDate(new Date())));
  refresh();
  return result;
}

export async function renameFolderAction(folderId: string, name: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = folderNameSchema.safeParse(name);
  if (!parsed.success || !idSchema.safeParse(folderId).success) return invalid;
  const result = await attempt(() => renameFolder(getDb(), user.id, folderId, parsed.data));
  refresh();
  return result;
}

export async function deleteFolderAction(folderId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(folderId).success) return invalid;
  const result = await attempt(() => deleteFolder(getDb(), user.id, folderId));
  refresh();
  return result;
}

/** Rolle eines Plans: Hauptplan, Zusatzplan, inaktiv oder Archiv. */
export async function setPlanStatusAction(folderId: string, status: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.enum(PLAN_STATUSES).safeParse(status);
  if (!parsed.success || !idSchema.safeParse(folderId).success) return invalid;
  const result = await attempt(() => setPlanStatus(getDb(), user.id, folderId, parsed.data));
  refresh();
  return result;
}

/** Fester Ort eines Plans; `null` = Ort des Tages. */
export async function setPlanGymAction(folderId: string, gymId: string | null): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(folderId).success || !idSchema.nullable().safeParse(gymId).success) return invalid;
  const result = await attempt(() => setPlanGym(getDb(), user.id, folderId, gymId));
  refresh();
  return result;
}

export async function createRoutineAction(folderId: string, name: string): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = folderNameSchema.safeParse(name);
  if (!parsed.success || !idSchema.safeParse(folderId).success) return invalid;
  const result = await attempt(() => createRoutine(getDb(), user.id, folderId, parsed.data));
  refresh();
  return result;
}

export async function saveRoutineAction(planDayId: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = routineSchema.safeParse(input);
  if (!parsed.success || !idSchema.safeParse(planDayId).success) return invalid;
  const result = await attempt(() => saveRoutine(getDb(), user.id, planDayId, parsed.data));
  refresh();
  return result;
}

export async function deleteRoutineAction(planDayId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(planDayId).success) return invalid;
  const result = await attempt(() => deleteRoutine(getDb(), user.id, planDayId));
  refresh();
  return result;
}

export async function duplicateRoutineAction(planDayId: string, name: string): Promise<ActionResult<string>> {
  const user = await requireUser();
  const parsed = folderNameSchema.safeParse(name);
  if (!parsed.success || !idSchema.safeParse(planDayId).success) return invalid;
  const result = await attempt(() => duplicateRoutine(getDb(), user.id, planDayId, parsed.data));
  refresh();
  return result;
}

export async function saveInjuriesAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = injuriesSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => saveInjuries(getDb(), user.id, parsed.data.injuries, parsed.data.injuryNote));
  refresh();
  return result;
}

const modesSchema = z.object({
  recoveryMode: z.boolean().optional(),
  gripModule: z.boolean().optional(),
  exerciseCheckIn: z.boolean().optional(),
});

export async function saveModesAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = modesSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => saveTrainingSettings(getDb(), user.id, parsed.data));
  refresh();
  return result;
}

/** `null` beendet den Urlaub. */
export async function saveVacationAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = vacationSchema.nullable().safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => saveTrainingSettings(getDb(), user.id, { vacation: parsed.data }));
  refresh();
  return result;
}

/** `null` schaltet das zyklusangepasste Training ab und löscht die Angaben. */
export async function saveCycleAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = cycleSchema.nullable().safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => saveTrainingSettings(getDb(), user.id, { cycle: parsed.data }));
  refresh();
  return result;
}

export async function saveExtraSportsAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = extraSportsSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => saveTrainingSettings(getDb(), user.id, { extraSports: parsed.data }));
  refresh();
  return result;
}
