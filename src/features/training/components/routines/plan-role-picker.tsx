"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { setPlanStatusAction } from "../../flex-actions";

/** Rollen, die sich auf der Plan-Seite wählen lassen; das Archiv liegt bei „Plan verwalten“. */
const ROLES = ["active", "extra", "saved"] as const;
type Role = (typeof ROLES)[number];

const TOASTS: Record<Role, "madeMain" | "madeExtra" | "unscheduled"> = {
  active: "madeMain",
  extra: "madeExtra",
  saved: "unscheduled",
};

interface PlanRolePickerProps {
  folderId: string;
  title: string;
  status: Role;
  /** Name des bisherigen Hauptplans für die Rückfrage; `null`, wenn es keinen gibt. */
  currentMain: string | null;
}

/**
 * Einplanung eines Plans als drei erklärte Optionen. Der Hauptplan ist fest, bis ein anderer
 * Plan ihn ablöst; das Ablösen wird vorher bestätigt.
 */
export function PlanRolePicker({ folderId, title, status, currentMain }: PlanRolePickerProps) {
  const t = useTranslations("routines");
  const common = useTranslations("common");
  const cancelLabel = common("cancel");
  const { run, pending } = useActionRunner();
  const [confirmMain, setConfirmMain] = useState(false);
  const isMain = status === "active";

  const change = (target: Role) =>
    run(
      () => setPlanStatusAction(folderId, target),
      () => toast.success(t(TOASTS[target], { name: title })),
    );
  const choose = (target: Role) => {
    if (target === status) return;
    if (target === "active" && currentMain !== null) setConfirmMain(true);
    else change(target);
  };

  return (
    <div className="grid gap-2">
      <ul className="grid gap-2" role="radiogroup" aria-label={t("roleTitle")}>
        {ROLES.map((role) => {
          const selected = role === status;
          return (
            <li key={role}>
              <Button
                type="button"
                variant="outline"
                role="radio"
                aria-checked={selected}
                disabled={pending || (isMain && !selected)}
                className={cn(
                  "h-auto min-h-11 w-full items-start justify-start gap-3 py-3 text-left whitespace-normal",
                  selected && "border-primary",
                )}
                onClick={() => choose(role)}
              >
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border",
                    selected && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {selected ? <CheckIcon className="size-3.5" /> : null}
                </span>
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="font-medium">{t(`roles.${role}.label`)}</span>
                  <span className="text-muted-foreground text-sm font-normal">{t(`roles.${role}.text`)}</span>
                </span>
              </Button>
            </li>
          );
        })}
      </ul>
      {isMain ? <p className="text-muted-foreground text-sm">{t("mainLocked")}</p> : null}

      <AlertDialog open={confirmMain} onOpenChange={setConfirmMain}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("makeMainTitle", { name: title })}</AlertDialogTitle>
            <AlertDialogDescription>{t("makeMainText", { current: currentMain ?? "" })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction onClick={() => change("active")}>{t("makeMainConfirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
