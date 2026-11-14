"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PLAN_CHANGE_ACTIONS, MAX_PLAN_CHANGES } from "@/domain/ai/plan-changes";
import { requireUser } from "@/features/auth/session";
import { attempt, invalid, type ActionResult } from "@/lib/action-result";
import { toLocalDate } from "@/lib/dates";
import { getLlmProvider } from "@/lib/llm";
import { getDb, getEnv } from "@/lib/server/context";
import { setAiConsent } from "./services/ai-service";
import { deleteBodyFatEstimate, estimateBodyFat, type BodyFatOutcome } from "./services/body-fat-service";
import { MAX_WISH_LENGTH, applyPlanSuggestions, suggestPlanChanges, type PlanSuggestions } from "./services/plan-refinement";

const idSchema = z.string().min(1).max(80);
const wishSchema = z.string().trim().min(3).max(MAX_WISH_LENGTH);
const changesSchema = z
  .array(
    z.object({
      dayId: idSchema,
      action: z.enum(PLAN_CHANGE_ACTIONS),
      exerciseId: idSchema,
      newExerciseId: idSchema.nullable(),
      sets: z.number().nullable(),
      repMin: z.number().nullable(),
      repMax: z.number().nullable(),
      reason: z.string().max(400),
    }),
  )
  .min(1)
  .max(MAX_PLAN_CHANGES);

const refresh = () => revalidatePath("/", "layout");

/** Schaltet die KI-Funktionen für das eigene Konto ein oder aus (Zustimmung zur Datenweitergabe). */
export async function setAiConsentAction(enabled: boolean): Promise<ActionResult> {
  const user = await requireUser();
  if (typeof enabled !== "boolean") return invalid;
  const result = await attempt(() => setAiConsent(getDb(), user.id, enabled));
  refresh();
  return result;
}

export async function suggestPlanChangesAction(wish: string): Promise<ActionResult<PlanSuggestions>> {
  const user = await requireUser();
  const parsed = wishSchema.safeParse(wish);
  if (!parsed.success) return invalid;
  return attempt(() =>
    suggestPlanChanges(getDb(), getLlmProvider(getEnv()), user.id, parsed.data, toLocalDate(new Date())),
  );
}

export async function applyPlanChangesAction(changes: unknown): Promise<ActionResult<number>> {
  const user = await requireUser();
  const parsed = changesSchema.safeParse(changes);
  if (!parsed.success) return invalid;
  const result = await attempt(() => applyPlanSuggestions(getDb(), user.id, parsed.data, toLocalDate(new Date())));
  refresh();
  return result;
}

export async function estimateBodyFatAction(photoId: string): Promise<ActionResult<BodyFatOutcome>> {
  const user = await requireUser();
  if (!idSchema.safeParse(photoId).success) return invalid;
  const env = getEnv();
  const result = await attempt(() =>
    estimateBodyFat(getDb(), env.UPLOADS, getLlmProvider(env), user.id, photoId, toLocalDate(new Date())),
  );
  refresh();
  return result;
}

export async function deleteBodyFatEstimateAction(estimateId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(estimateId).success) return invalid;
  const result = await attempt(() => deleteBodyFatEstimate(getDb(), user.id, estimateId));
  refresh();
  return result;
}
