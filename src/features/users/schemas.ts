import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "@/lib/auth/password";
import { DISPLAY_NAME_MAX_LENGTH, ROLES } from "@/domain/permissions/user-management";
import { THEMES, UNIT_SYSTEMS } from "./services/account-service";

export const profileSchema = z.object({
  name: z.string().trim().min(1).max(60),
});

export const preferencesSchema = z.object({
  theme: z.enum(THEMES),
  unitSystem: z.enum(UNIT_SYSTEMS),
});

const password = z.string().max(PASSWORD_MAX_LENGTH);

export const changePasswordSchema = z.object({
  currentPassword: password.min(1),
  newPassword: password,
  confirmPassword: password,
});

export const setUserPasswordSchema = z.object({
  userId: z.string().min(1),
  newPassword: password,
  confirmPassword: password,
});

// Die genaue Prüfung des Benutzernamens macht der Dienst (eigene Fehlermeldung).
const usernameInput = z.string().trim().min(1).max(100);
const displayNameInput = z.string().trim().max(DISPLAY_NAME_MAX_LENGTH);

export const createUserSchema = z.object({
  username: usernameInput,
  name: displayNameInput,
  role: z.enum(ROLES),
  newPassword: password,
  confirmPassword: password,
});

export const updateUserSchema = z.object({
  userId: z.string().min(1),
  username: usernameInput,
  name: displayNameInput,
  role: z.enum(ROLES),
});

export const deleteUserSchema = z.object({ userId: z.string().min(1) });

export function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") result[key] = value;
  });
  return result;
}
