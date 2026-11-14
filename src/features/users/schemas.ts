import { z } from "zod";
import { PASSWORD_MAX_LENGTH } from "@/lib/auth/password";
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

export function formDataToObject(formData: FormData): Record<string, string> {
  const result: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") result[key] = value;
  });
  return result;
}
