"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/features/auth/session";
import { attempt, invalid, type ActionResult } from "@/lib/action-result";
import { toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";
import { deleteLog, logRoutine } from "./services/mobility-service";

const MAX_DURATION_SECONDS = 4 * 60 * 60;

const completeSchema = z.object({
  routineId: z.string().min(1).max(80),
  durationSeconds: z.number().int().min(1).max(MAX_DURATION_SECONDS),
});
const idSchema = z.string().min(1).max(80);

const refresh = () => revalidatePath("/", "layout");

/** Trägt die Routine für heute als erledigt ein; das Datum bestimmt der Server. */
export async function completeMobilityRoutineAction(routineId: string, durationSeconds: number): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = completeSchema.safeParse({ routineId, durationSeconds });
  if (!parsed.success) return invalid;
  const result = await attempt(async () => {
    await logRoutine(getDb(), user.id, { ...parsed.data, date: toLocalDate(new Date()) });
  });
  refresh();
  return result;
}

export async function deleteMobilityLogAction(logId: string): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(logId);
  if (!parsed.success) return invalid;
  const result = await attempt(() => deleteLog(getDb(), user.id, parsed.data));
  refresh();
  return result;
}
