"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getDb, getEnv } from "@/lib/server/context";
import { getAuth } from "@/lib/auth/server";
import { type ActionState, toErrorCode } from "@/lib/errors";
import { type ActionResult, attempt, invalid } from "@/lib/action-result";
import { requireAdmin, requireUser } from "@/features/auth/session";
import {
  changeOwnPassword,
  setPasswordAsAdmin,
} from "@/features/auth/services/password-service";
import { updateDisplayName, updatePreferences } from "./services/account-service";
import { createUserAsAdmin, deleteUserAsAdmin, updateUserAsAdmin } from "./services/user-admin-service";
import {
  changePasswordSchema,
  createUserSchema,
  deleteUserSchema,
  formDataToObject,
  preferencesSchema,
  profileSchema,
  setUserPasswordSchema,
  updateUserSchema,
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

export async function createUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = createUserSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "VALIDATION" };
  if (parsed.data.newPassword !== parsed.data.confirmPassword) {
    return { status: "error", error: "PASSWORD_MISMATCH" };
  }
  const result = await run(async () => {
    await createUserAsAdmin(getDb(), admin, {
      username: parsed.data.username,
      name: parsed.data.name,
      password: parsed.data.newPassword,
      role: parsed.data.role,
    });
  });
  revalidatePath("/admin");
  return result;
}

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const parsed = updateUserSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return { status: "error", error: "VALIDATION" };
  const result = await run(() =>
    updateUserAsAdmin(getDb(), admin, {
      targetUserId: parsed.data.userId,
      username: parsed.data.username,
      name: parsed.data.name,
      role: parsed.data.role,
    }),
  );
  // Der eigene Name steht auch in der Navigation.
  revalidatePath("/", "layout");
  return result;
}

export async function deleteUserAction(userId: string): Promise<ActionResult> {
  const admin = await requireAdmin();
  const parsed = deleteUserSchema.safeParse({ userId });
  if (!parsed.success) return invalid;
  const result = await attempt(() => deleteUserAsAdmin(getDb(), getEnv().UPLOADS, admin, parsed.data.userId));
  revalidatePath("/admin");
  return result;
}

export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/login");
}
