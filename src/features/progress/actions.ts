"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, getEnv } from "@/lib/server/context";
import { attempt, invalid, type ActionResult } from "@/lib/action-result";
import { isValidLocalDate } from "@/lib/dates";
import { MUSCLES } from "@/domain/exercises/types";
import { MEASUREMENT_SITES } from "@/domain/progress/types";
import { requireUser } from "@/features/auth/session";
import { saveDashboardWidgets } from "./services/dashboard-service";
import { deletePhoto } from "./services/photo-service";
import { deleteMeasurement, saveMeasurement, setRecoveryOverride } from "./services/progress-service";

const dateSchema = z.string().refine(isValidLocalDate);
const measurementSchema = z.object({
  date: dateSchema,
  site: z.enum(MEASUREMENT_SITES),
  valueCm: z.number().min(5).max(300),
});
const overrideSchema = z.object({ muscle: z.enum(MUSCLES), percent: z.number().int().min(0).max(100) });
const widgetsSchema = z.array(z.object({ id: z.string().max(40), visible: z.boolean() })).max(20);

export async function saveMeasurementAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = measurementSchema.safeParse(input);
  if (!parsed.success) return invalid;
  const result = await attempt(() => saveMeasurement(getDb(), user.id, parsed.data));
  revalidatePath("/progress", "layout");
  return result;
}

export async function deleteMeasurementAction(site: string, date: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z.object({ site: z.enum(MEASUREMENT_SITES), date: dateSchema }).safeParse({ site, date });
  if (!parsed.success) return invalid;
  const result = await attempt(() => deleteMeasurement(getDb(), user.id, parsed.data.site, parsed.data.date));
  revalidatePath("/progress", "layout");
  return result;
}

export async function setRecoveryOverrideAction(muscle: string, percent: number): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = overrideSchema.safeParse({ muscle, percent });
  if (!parsed.success) return invalid;
  const result = await attempt(() => setRecoveryOverride(getDb(), user.id, parsed.data.muscle, parsed.data.percent));
  revalidatePath("/", "layout");
  return result;
}

export async function deletePhotoAction(photoId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.string().min(1).max(80).safeParse(photoId).success) return invalid;
  const result = await attempt(() => deletePhoto(getDb(), getEnv().UPLOADS, user.id, photoId));
  revalidatePath("/progress", "layout");
  return result;
}

export async function saveDashboardAction(widgets: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = widgetsSchema.safeParse(widgets);
  if (!parsed.success) return invalid;
  const result = await attempt(() => saveDashboardWidgets(getDb(), user.id, parsed.data));
  revalidatePath("/", "layout");
  return result;
}
