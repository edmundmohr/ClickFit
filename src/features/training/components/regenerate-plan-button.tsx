"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RefreshCwIcon } from "lucide-react";
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
import { regeneratePlanAction } from "../actions";

export function RegeneratePlanButton() {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function regenerate() {
    startTransition(async () => {
      const result = await regeneratePlanAction();
      if (result.ok) {
        toast.success(t("training.plan.regenerated"));
        router.refresh();
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" disabled={pending}>
          <RefreshCwIcon aria-hidden />
          {t("training.plan.regenerate")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("training.plan.regenerateTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("training.plan.regenerateText")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={regenerate}>{t("training.plan.regenerateConfirm")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
