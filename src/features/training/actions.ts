"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getDb } from "@/lib/server/context";
import { fail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { toLocalDate } from "@/lib/dates";
import { requireUser } from "@/features/auth/session";
import type { Exercise } from "@/domain/exercises/types";
import type { WeightUnit } from "@/domain/training/weights";
import { onboardingSchema, saveSetSchema } from "./schemas";
import { getRecoveryDay } from "./services/recovery-day-service";
import { saveOnboarding } from "./services/profile-service";
import { createPlanFromProfile, getSwapOptions, swapPlanExercise } from "./services/plan-service";
import {
  deleteSet,
  deleteWorkout,
  finishWorkout,
  saveExerciseNote,
  saveSessionNote,
  saveSet,
  startFreeWorkout,
  startWorkout,
} from "./services/workout-service";

/** Einheit aus den Einstellungen des Nutzers. */
function unitOf(user: { unitSystem?: string | null }): WeightUnit {
  return user.unitSystem === "imperial" ? "lbs" : "kg";
}


const idSchema = z.string().min(1).max(80);
const noteSchema = z.string().max(500);

export async function completeOnboardingAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) return invalid;
  try {
    const db = getDb();
    await saveOnboarding(db, user.id, parsed.data);
    await createPlanFromProfile(db, user.id, toLocalDate(new Date()));
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function regeneratePlanAction(): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await createPlanFromProfile(getDb(), user.id, toLocalDate(new Date()));
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/", "layout");
  return ok(undefined);
}

export type SwapOption = Pick<Exercise, "id" | "name" | "primary" | "equipment">;

export async function getSwapOptionsAction(planExerciseId: string): Promise<ActionResult<SwapOption[]>> {
  const user = await requireUser();
  if (!idSchema.safeParse(planExerciseId).success) return invalid;
  try {
    const options = await getSwapOptions(getDb(), user.id, planExerciseId);
    return ok(options.map(({ id, name, primary, equipment }) => ({ id, name, primary, equipment })));
  } catch (error) {
    return fail(error);
  }
}

export async function swapExerciseAction(planExerciseId: string, newExerciseId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(planExerciseId).success || !idSchema.safeParse(newExerciseId).success) {
    return invalid;
  }
  try {
    await swapPlanExercise(getDb(), user.id, planExerciseId, newExerciseId);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/training");
  return ok(undefined);
}

/** Startet das Training eines Plantags (oder setzt ein laufendes fort) und öffnet den Trainingsmodus. */
export async function startWorkoutAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const planDayId = idSchema.safeParse(formData.get("planDayId"));
  if (!planDayId.success) redirect("/training");
  const sessionId = await startWorkout(getDb(), user.id, planDayId.data, new Date(), {
    short: formData.get("short") === "1",
    defaultUnit: unitOf(user),
  });
  redirect(`/workout/${sessionId}`);
}

/** Erholungsorientierter Modus: startet das Training aus den heute frischesten Muskelgruppen. */
export async function startRecoveryWorkoutAction(): Promise<void> {
  const user = await requireUser();
  const db = getDb();
  const day = await getRecoveryDay(db, user.id);
  if (!day || day.exercises.length === 0) redirect("/training");
  const t = await getTranslations("training.recoveryMode");
  const sessionId = await startFreeWorkout(db, user.id, t("sessionName"), day.exercises, new Date(), {
    defaultUnit: unitOf(user),
  });
  redirect(`/workout/${sessionId}`);
}

export async function saveSetAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = saveSetSchema.safeParse(input);
  if (!parsed.success) return invalid;
  try {
    await saveSet(getDb(), user.id, parsed.data);
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function deleteSetAction(setId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!z.uuid().safeParse(setId).success) return invalid;
  try {
    await deleteSet(getDb(), user.id, setId);
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function finishWorkoutAction(sessionId: string, finishedAtIso?: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(sessionId).success) return invalid;
  const finishedAt = finishedAtIso ? new Date(finishedAtIso) : new Date();
  if (Number.isNaN(finishedAt.getTime()) || finishedAt.getTime() > Date.now() + 60_000) return invalid;
  try {
    await finishWorkout(getDb(), user.id, sessionId, finishedAt);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function deleteWorkoutAction(sessionId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(sessionId).success) return invalid;
  try {
    await deleteWorkout(getDb(), user.id, sessionId);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/", "layout");
  return ok(undefined);
}

export async function saveExerciseNoteAction(exerciseId: string, note: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(exerciseId).success || !noteSchema.safeParse(note).success) return invalid;
  try {
    await saveExerciseNote(getDb(), user.id, exerciseId, note);
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}

export async function saveSessionNoteAction(sessionId: string, note: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!idSchema.safeParse(sessionId).success || !noteSchema.safeParse(note).success) return invalid;
  try {
    await saveSessionNote(getDb(), user.id, sessionId, note);
    return ok(undefined);
  } catch (error) {
    return fail(error);
  }
}
