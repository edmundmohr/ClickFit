"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react";
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
import { deleteBodyFatEstimateAction, estimateBodyFatAction } from "../actions";
import type { BodyFatEstimateView } from "../services/body-fat-service";

export interface BodyFatAi {
  /** Die KI ist eingerichtet und für das Konto eingeschaltet. */
  enabled: boolean;
  provider: string;
}

interface BodyFatSectionProps {
  photoId: string;
  estimate: BodyFatEstimateView | null;
  ai: BodyFatAi;
}

/** Grobe Körperfett-Schätzung zu einem Foto: anzeigen, anfordern (mit Rückfrage) und löschen. */
export function BodyFatSection({ photoId, estimate, ai }: BodyFatSectionProps) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(estimate);
  const [notPossible, setNotPossible] = useState<string | null>(null);

  function request() {
    setNotPossible(null);
    startTransition(async () => {
      const result = await estimateBodyFatAction(photoId).catch(() => null);
      if (!result?.ok) {
        toast.error(t(`errors.${result?.error ?? "AI_FAILED"}`));
        return;
      }
      if (result.data.status === "estimated") setCurrent(result.data.estimate);
      else setNotPossible(result.data.note);
      router.refresh();
    });
  }

  function remove(estimateId: string) {
    startTransition(async () => {
      const result = await deleteBodyFatEstimateAction(estimateId).catch(() => null);
      if (!result?.ok) {
        toast.error(t(`errors.${result?.error ?? "UNKNOWN"}`));
        return;
      }
      setCurrent(null);
      toast.success(t("ai.bodyFat.deleted"));
      router.refresh();
    });
  }

  return (
    <section className="bg-secondary grid gap-2 rounded-lg p-3">
      <h3 className="text-sm font-medium">{t("ai.bodyFat.title")}</h3>
      {current ? (
        <>
          <p className="text-2xl font-semibold tabular-nums">
            {t("ai.bodyFat.range", { low: current.lowPercent, high: current.highPercent })}
          </p>
          {current.note ? <p className="text-sm">{current.note}</p> : null}
          <p className="text-muted-foreground text-xs">{t("ai.bodyFat.disclaimer")}</p>
        </>
      ) : null}
      {notPossible !== null ? (
        <div className="text-sm">
          <p className="font-medium">{t("ai.bodyFat.notPossible")}</p>
          <p>{notPossible}</p>
        </div>
      ) : null}
      {pending ? (
        <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
          <Loader2Icon className="size-4 animate-spin" aria-hidden />
          {t("ai.bodyFat.loading")}
        </p>
      ) : null}
      {ai.enabled ? (
        <div className="flex flex-wrap gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={pending}>
                <SparklesIcon aria-hidden />
                {t(current ? "ai.bodyFat.again" : "ai.bodyFat.start")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("ai.bodyFat.confirmTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("ai.bodyFat.confirmText", { provider: ai.provider })}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={request}>{t("ai.bodyFat.confirm")}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          {current ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => remove(current.id)}>
              <Trash2Icon aria-hidden />
              {t("ai.bodyFat.delete")}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">{t("ai.bodyFat.needsConsent")}</p>
      )}
    </section>
  );
}
