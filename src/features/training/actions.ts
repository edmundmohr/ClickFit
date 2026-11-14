"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getDb } from "@/lib/server/context";
import { fail, invalid, ok, type ActionResult } from "@/lib/action-result";
import { toLocalDate } from "@/lib/dates";
import { AppError, type ActionState, type ErrorCode } from "@/lib/errors";
import { requireUser } from "@/features/auth/session";
import type { Exercise } from "@/domain/exercises/types";
import type { WeightUnit } from "@/domain/training/weights";
import { onboardingSchema } from "./schemas";
import { getRecoveryDay } from "./services/recovery-day-service";
import { saveOnboarding } from "./services/profile-service";
import { createPlanFromProfile, getSwapOptions, swapPlanExercise } from "./services/plan-service";
import { deleteWorkout, saveExerciseNote, startFreeWorkout, startWorkout } from "./services/workout-service";

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

/** Startet das Training aus dem Formular; erwartete Fehler (z. B. keine trainierbare Übung) als Ergebnis. */
async function startFromForm(formData: FormData): Promise<{ sessionId: string } | { error: ErrorCode; planDayId: string | null }> {
  const user = await requireUser();
  const planDayId = idSchema.safeParse(formData.get("planDayId"));
  if (!planDayId.success) return { error: "VALIDATION", planDayId: null };
  try {
    const sessionId = await startWorkout(getDb(), user.id, planDayId.data, new Date(), {
      short: formData.get("short") === "1",
      defaultUnit: unitOf(user),
    });
    return { sessionId };
  } catch (error) {
    if (!(error instanceof AppError)) throw error;
    return { error: error.code, planDayId: planDayId.data };
  }
}

/**
 * Startet das Training eines Plantags (oder setzt ein laufendes fort) und öffnet den Trainingsmodus.
 * Für `useActionState`: Lässt sich nichts starten (z. B. nur gelöschte Übungen), kommt der Fehler
 * als Ergebnis zurück, statt die Fehlerseite zu zeigen.
 */
export async function startWorkoutFormAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const result = await startFromForm(formData);
  if ("error" in result) return { status: "error", error: result.error };
  redirect(`/workout/${result.sessionId}`);
}

/**
 * Einfache Formular-Variante ohne Rückgabewert. Schlägt der Start fehl, geht es zur Routine,
 * damit sich die Ursache beheben lässt. Mit Fehlermeldung: `StartWorkoutForm`.
 */
export async function startWorkoutAction(formData: FormData): Promise<void> {
  const result = await startFromForm(formData);
  if ("error" in result) redirect(result.planDayId ? `/training/routines/${result.planDayId}` : "/training");
  redirect(`/workout/${result.sessionId}`);
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
