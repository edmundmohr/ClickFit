"use client";

import { useActionState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/hooks/use-action-toast";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { IDLE_STATE } from "@/lib/errors";
import { changePasswordAction } from "../actions";

export function ChangePasswordForm() {
  const t = useTranslations();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(changePasswordAction, IDLE_STATE);
  const resetForm = useCallback(() => formRef.current?.reset(), []);
  useActionToast(state, t("settings.password.success"), resetForm);

  return (
    <form ref={formRef} action={formAction} className="grid gap-4">
      <Field
        id="current-password"
        name="currentPassword"
        type="password"
        label={t("settings.password.current")}
        autoComplete="current-password"
        required
      />
      <Field
        id="new-password"
        name="newPassword"
        type="password"
        label={t("settings.password.new")}
        hint={t("settings.password.hint", { min: PASSWORD_MIN_LENGTH })}
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        required
      />
      <Field
        id="confirm-password"
        name="confirmPassword"
        type="password"
        label={t("settings.password.confirm")}
        autoComplete="new-password"
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        required
      />
      <FormError code={state.status === "error" ? state.error : null} />
      <SubmitButton pendingLabel={t("common.saving")} className="justify-self-start">
        {t("settings.password.submit")}
      </SubmitButton>
    </form>
  );
}
