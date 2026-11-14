"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/hooks/use-action-toast";
import { IDLE_STATE } from "@/lib/errors";
import { updateProfileAction } from "../actions";

export function ProfileForm({ name, username }: { name: string; username: string }) {
  const t = useTranslations();
  const [state, formAction] = useActionState(updateProfileAction, IDLE_STATE);
  useActionToast(state, t("common.saved"));

  return (
    <form action={formAction} className="grid gap-4">
      <Field
        id="profile-username"
        label={t("settings.profile.username")}
        hint={t("settings.profile.usernameHint")}
        value={username}
        readOnly
        disabled
      />
      <Field
        id="profile-name"
        name="name"
        label={t("settings.profile.name")}
        defaultValue={name}
        maxLength={60}
        autoComplete="nickname"
        required
      />
      <FormError code={state.status === "error" ? state.error : null} />
      <SubmitButton pendingLabel={t("common.saving")} className="justify-self-start">
        {t("common.save")}
      </SubmitButton>
    </form>
  );
}
