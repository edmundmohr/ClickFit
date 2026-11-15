"use client";

import { type FormEvent, type ReactNode, useActionState, useCallback, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2Icon, PencilIcon, UserPlusIcon } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { useActionToast } from "@/hooks/use-action-toast";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth/password";
import { type ActionState, IDLE_STATE } from "@/lib/errors";
import {
  DISPLAY_NAME_MAX_LENGTH,
  ROLES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
  type Role,
} from "@/domain/permissions/user-management";
import { createUserAction, updateUserAction } from "../actions";

type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Formular im Dialog. Abgeschickt wird von Hand statt über `action`, damit die Eingaben
 * bei einem Fehler (z. B. Benutzername vergeben) stehen bleiben.
 */
function useDialogForm(action: FormAction, successMessage: (formData: FormData) => string) {
  const [open, setOpen] = useState(false);
  const [state, dispatch] = useActionState(action, IDLE_STATE);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState("");
  const close = useCallback(() => setOpen(false), []);
  useActionToast(state, message, close);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setMessage(successMessage(formData));
    startTransition(() => dispatch(formData));
  }

  // Die Fehlermeldung gehört zum letzten Versuch, nicht zu einem neu geöffneten Dialog.
  const [shownFor, setShownFor] = useState<ActionState>(IDLE_STATE);
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) setShownFor(state);
  }
  const error = state.status === "error" && state !== shownFor ? state.error : null;

  return { open, onOpenChange, close, onSubmit, pending, error };
}

function submittedName(formData: FormData): string {
  const name = formData.get("name");
  const username = formData.get("username");
  const pick = (value: FormDataEntryValue | null) => (typeof value === "string" ? value.trim() : "");
  return pick(name) || pick(username);
}

function IdentityFields({ idPrefix, username, name }: { idPrefix: string; username?: string; name?: string }) {
  const t = useTranslations("admin");
  return (
    <>
      <Field
        id={`${idPrefix}-username`}
        name="username"
        label={t("username")}
        hint={t("usernameHint")}
        defaultValue={username}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        minLength={USERNAME_MIN_LENGTH}
        maxLength={USERNAME_MAX_LENGTH}
        pattern={USERNAME_PATTERN}
        required
      />
      <Field
        id={`${idPrefix}-name`}
        name="name"
        label={t("displayName")}
        hint={t("displayNameHint")}
        defaultValue={name}
        autoComplete="off"
        maxLength={DISPLAY_NAME_MAX_LENGTH}
      />
    </>
  );
}

function RoleField({ id, defaultValue }: { id: string; defaultValue: Role }) {
  const t = useTranslations("admin");
  const [role, setRole] = useState<Role>(defaultValue);
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{t("role")}</Label>
      <Select
        name="role"
        value={role}
        onValueChange={(value) => setRole(ROLES.find((entry) => entry === value) ?? "user")}
      >
        <SelectTrigger id={id} className="w-full" aria-describedby={`${id}-hint`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ROLES.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`roles.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {t(`roleHints.${role}`)}
      </p>
    </div>
  );
}

function FormFooter({ pending, onCancel, children }: { pending: boolean; onCancel: () => void; children: ReactNode }) {
  const t = useTranslations("common");
  return (
    <DialogFooter>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {t("cancel")}
      </Button>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <>
            <Loader2Icon className="animate-spin" aria-hidden />
            {t("saving")}
          </>
        ) : (
          children
        )}
      </Button>
    </DialogFooter>
  );
}

const DIALOG_CLASS = "max-h-[calc(100dvh-2rem)] overflow-y-auto";

export function CreateUserDialog() {
  const t = useTranslations();
  const form = useDialogForm(createUserAction, (formData) =>
    t("admin.create.success", { name: submittedName(formData) }),
  );

  return (
    <Dialog open={form.open} onOpenChange={form.onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <UserPlusIcon aria-hidden />
          {t("admin.create.open")}
        </Button>
      </DialogTrigger>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle>{t("admin.create.title")}</DialogTitle>
          <DialogDescription>{t("admin.create.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.onSubmit} className="grid gap-4">
          <IdentityFields idPrefix="create-user" />
          <RoleField id="create-user-role" defaultValue="user" />
          <Field
            id="create-user-password"
            name="newPassword"
            type="password"
            label={t("admin.password")}
            hint={t("settings.password.hint", { min: PASSWORD_MIN_LENGTH })}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            required
          />
          <Field
            id="create-user-confirm"
            name="confirmPassword"
            type="password"
            label={t("admin.create.confirmPassword")}
            autoComplete="new-password"
            minLength={PASSWORD_MIN_LENGTH}
            maxLength={PASSWORD_MAX_LENGTH}
            required
          />
          <FormError code={form.error} />
          <FormFooter pending={form.pending} onCancel={form.close}>
            {t("admin.create.submit")}
          </FormFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EditUserDialogProps {
  user: { id: string; name: string; username: string; role: Role };
  isSelf: boolean;
}

export function EditUserDialog({ user, isSelf }: EditUserDialogProps) {
  const t = useTranslations();
  const form = useDialogForm(updateUserAction, (formData) =>
    t("admin.edit.success", { name: submittedName(formData) }),
  );

  return (
    <Dialog open={form.open} onOpenChange={form.onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilIcon aria-hidden />
          {t("admin.edit.open")}
        </Button>
      </DialogTrigger>
      <DialogContent className={DIALOG_CLASS}>
        <DialogHeader>
          <DialogTitle>{t("admin.edit.title", { name: user.name })}</DialogTitle>
          <DialogDescription>{isSelf ? t("admin.ownRoleHint") : t("admin.edit.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={form.onSubmit} className="grid gap-4">
          <input type="hidden" name="userId" value={user.id} />
          <IdentityFields idPrefix={`edit-user-${user.id}`} username={user.username} name={user.name} />
          {isSelf ? (
            <input type="hidden" name="role" value={user.role} />
          ) : (
            <RoleField id={`edit-user-${user.id}-role`} defaultValue={user.role} />
          )}
          <FormError code={form.error} />
          <FormFooter pending={form.pending} onCancel={form.close}>
            {t("common.save")}
          </FormFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
