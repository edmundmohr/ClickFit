"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/server/context";
import { getAuth } from "@/lib/auth/server";
import { type ActionState, toErrorCode } from "@/lib/errors";
import { requireAdmin, requireUser } from "@/features/auth/session";
import {
  changeOwnPassword,
  setPasswordAsAdmin,
} from "@/features/auth/services/password-service";
import { updateDisplayName, updatePreferences } from "./services/account-service";
import {
  changePasswordSchema,
  formDataToObject,
  preferencesSchema,
  profileSchema,
  setUserPasswordSchema,
} from "./schemas";

async function run(task: () => Promise<void>): Promise<ActionState> {
  try {
    await task();
    return { status: "success" };
  } catch (error) {
    return { status: "error", error: toErrorCode(error) };
  }
}

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "VALIDATION" };
  const result = await run(() => updateDisplayName(getDb(), user.id, parsed.data.name));
  revalidatePath("/", "layout");
  return result;
}

export async function updatePreferencesAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "VALIDATION" };
  const result = await run(() => updatePreferences(getDb(), user.id, parsed.data));
  revalidatePath("/", "layout");
  return result;
}

export async function changePasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = changePasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "VALIDATION" };
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { status: "error", error: "PASSWORD_MISMATCH" };
  }
  return run(() =>
    changeOwnPassword(getDb(), {
      userId: user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      keepSessionToken: user.sessionToken,
    }),
  );
}

export async function setUserPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = setUserPasswordSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "VALIDATION" };
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { status: "error", error: "PASSWORD_MISMATCH" };
  }
  return run(() =>
    setPasswordAsAdmin(getDb(), admin, {
      targetUserId: parsed.data.userId,
      newPassword: parsed.data.newPassword,
    }),
  );
}

export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}
