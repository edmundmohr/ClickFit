"use client";

import { useTranslations } from "next-intl";
import { ClipboardCheckIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { LocalDate } from "@/lib/dates";
import { applyPlanDayAction, deletePlanEntryAction } from "../actions";

export function RemovePlanEntryButton({ entryId, name }: { entryId: string; name: string }) {
  const t = useTranslations("nutrition.plan");
  const { run, pending } = useActionRunner();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("remove", { name })}
      disabled={pending}
      onClick={() => run(() => deletePlanEntryAction(entryId))}
    >
      <XIcon aria-hidden />
    </Button>
  );
}

/** Überträgt den Plan des gewählten Wochentags in das Tagebuch von heute. */
export function ApplyPlanButton({ weekday, today }: { weekday: number; today: LocalDate }) {
  const t = useTranslations("nutrition.plan");
  const { run, pending } = useActionRunner();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => run(() => applyPlanDayAction(weekday, today), (count) => toast.info(t("applied", { count })))}
    >
      <ClipboardCheckIcon aria-hidden />
      {t("apply")}
    </Button>
  );
}
