"use client";

import { useActionState, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { KeyRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/hooks/use-action-toast";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { IDLE_STATE } from "@/lib/errors";
import { setUserPasswordAction } from "../actions";

export function SetPasswordDialog({ userId, name }: { userId: string; name: string }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(setUserPasswordAction, IDLE_STATE);
  const close = useCallback(() => setOpen(false), []);
  useActionToast(state, t("admin.success", { name }), close);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <KeyRoundIcon aria-hidden />
          {t("admin.setPassword")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.dialogTitle", { name })}</DialogTitle>
          <DialogDescription>{t("admin.dialogDescription", { name })}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="userId" value={userId} />
          <Field
            id={`new-password-${userId}`}
            name="newPassword"
            type="password"
            label={t("admin.newPassword")}
            hint={t("settings.password.hint", { min: PASSWORD_MIN_LENGTH })}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            required
          />
          <Field
            id={`confirm-password-${userId}`}
            name="confirmPassword"
            type="password"
            label={t("admin.confirmPassword")}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            required
          />
          <FormError code={state.status === "error" ? state.error : null} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              {t("common.cancel")}
            </Button>
            <SubmitButton pendingLabel={t("common.saving")}>{t("admin.submit")}</SubmitButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
