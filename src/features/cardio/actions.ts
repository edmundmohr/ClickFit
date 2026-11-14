"use server";

import { revalidatePath } from "next/cache";
import { attempt, invalid, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/lib/server/context";
import { requireUser } from "@/features/auth/session";
import { activitySchema, idSchema, saveCardioPlanEntrySchema } from "./schemas";
import { deleteActivity, logActivity } from "./services/activity-service";
import {
  addCardioPlanEntry,
  createCardioPlanFromProfile,
  deleteCardioPlanEntry,
  updateCardioPlanEntry,
} from "./services/cardio-plan-service";

// Cardio wirkt auch auf Erholung und Startseite, deshalb wird alles neu geladen.
const refresh = () => revalidatePath("/", "layout");

/** Trägt eine Cardio-Einheit oder Zusatzsport ein. */
export async function logActivityAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(async () => {
    await logActivity(getDb(), user.id, parsed.data);
  });
  refresh();
  return result;
}

export async function deleteActivityAction(activityId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(activityId).success) return invalid;
  const result = await attempt(() => deleteActivity(getDb(), user.id, activityId));
  refresh();
  return result;
}

/** Legt einen Plan-Eintrag an oder ändert ihn, wenn eine Kennung mitkommt. */
export async function saveCardioPlanEntryAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = saveCardioPlanEntrySchema.safeParse(input);
  if (!parsed.success) return invalid;
  const { id, ...entry } = parsed.data;
  const result = await attempt(async () => {
    if (id) await updateCardioPlanEntry(getDb(), user.id, id, entry);
    else await addCardioPlanEntry(getDb(), user.id, entry);
  });
  refresh();
  return result;
}

export async function deleteCardioPlanEntryAction(entryId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(entryId).success) return invalid;
  const result = await attempt(() => deleteCardioPlanEntry(getDb(), user.id, entryId));
  refresh();
  return result;
}

/** Ersetzt den Wochenplan durch einen aus dem Fragebogen erzeugten. Gibt die Zahl der Einheiten zurück. */
export async function createCardioPlanFromProfileAction(): Promise<ActionResult<number>> {
  const user = await requireUser();
  const result = await attempt(() => createCardioPlanFromProfile(getDb(), user.id));
  refresh();
  return result;
}
