"use client";

import { useTranslations } from "next-intl";
import { CheckIcon, Trash2Icon } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { deleteGymAction, setActiveGymAction } from "../../flex-actions";

/** Aktivieren und Löschen eines Trainingsorts. Der aktive Ort lässt sich nicht löschen. */
export function GymActions({ gymId, name, isActive }: { gymId: string; name: string; isActive: boolean }) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  if (isActive) return null;
  return (
    <>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => run(() => setActiveGymAction(gymId), () => toast.success(t("gyms.activated")))}
      >
        <CheckIcon aria-hidden />
        {t("gyms.activate")}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="text-destructive size-11" aria-label={t("gyms.delete")} disabled={pending}>
            <Trash2Icon aria-hidden />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("gyms.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("gyms.deleteText", { name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run(() => deleteGymAction(gymId), () => toast.success(t("gyms.deleted")))}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
