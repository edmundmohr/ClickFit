"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftRightIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FormError } from "@/components/forms/form-error";
import type { ErrorCode } from "@/lib/errors";
import { getSwapOptionsAction, swapExerciseAction, type SwapOption } from "../actions";

export function SwapExerciseDialog({ planExerciseId, name }: { planExerciseId: string; name: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SwapOption[] | null>(null);
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setOptions(null);
    setError(null);
    startTransition(async () => {
      const result = await getSwapOptionsAction(planExerciseId);
      if (result.ok) setOptions(result.data);
      else setError(result.error);
    });
  }

  function choose(exerciseId: string) {
    startTransition(async () => {
      const result = await swapExerciseAction(planExerciseId, exerciseId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(t("training.plan.swapDone"));
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t("training.plan.swapTitle", { name })}>
          <ArrowLeftRightIcon aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{t("training.plan.swapTitle", { name })}</DialogTitle>
          <DialogDescription>{t("training.plan.swapText")}</DialogDescription>
        </DialogHeader>
        <FormError code={error} />
        {options === null && !error ? (
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <Loader2Icon className="size-4 animate-spin" aria-hidden />
            {t("common.loading")}
          </p>
        ) : null}
        {options?.length === 0 ? <p className="text-muted-foreground text-sm">{t("training.plan.swapEmpty")}</p> : null}
        <ul className="grid gap-2">
          {options?.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => choose(option.id)}
                className="hover:bg-accent/60 w-full rounded-lg border px-3 py-3 text-left disabled:opacity-50"
              >
                <span className="block font-medium">{option.name}</span>
                <span className="text-muted-foreground block text-sm">
                  {option.primary.map((muscle) => t(`muscles.${muscle}`)).join(", ")}
                  {" · "}
                  {option.equipment.length > 0
                    ? option.equipment.map((item) => t(`equipment.${item}`)).join(", ")
                    : t("equipment.none")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
