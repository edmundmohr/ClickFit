"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { PlanChange } from "@/domain/ai/plan-changes";
import { cn } from "@/lib/utils";
import { applyPlanChangesAction, suggestPlanChangesAction } from "../actions";
import type { PlanSuggestions } from "../services/plan-refinement";

const MAX_WISH_LENGTH = 500;
const MIN_WISH_LENGTH = 3;

function changeKey(change: PlanChange): string {
  return `${change.dayId}:${change.exerciseId}`;
}

/** Plan-Feinschliff: Wunsch eingeben, Vorschläge der KI ansehen und ausgewählte übernehmen. */
export function PlanRefineDialog({ enabled }: { enabled: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [wish, setWish] = useState("");
  const [suggestions, setSuggestions] = useState<PlanSuggestions | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function reset() {
    setSuggestions(null);
    setSelected(new Set());
  }

  function request() {
    startTransition(async () => {
      const result = await suggestPlanChangesAction(wish).catch(() => null);
      if (!result?.ok) {
        toast.error(t(`errors.${result?.error ?? "AI_FAILED"}`));
        return;
      }
      setSuggestions(result.data);
      setSelected(new Set(result.data.changes.map(changeKey)));
    });
  }

  function apply() {
    const chosen = suggestions?.changes.filter((change) => selected.has(changeKey(change))) ?? [];
    startTransition(async () => {
      const result = await applyPlanChangesAction(chosen).catch(() => null);
      if (!result?.ok) {
        toast.error(t(`errors.${result?.error ?? "UNKNOWN"}`));
        return;
      }
      toast.success(t("ai.plan.applied", { count: result.data }));
      setOpen(false);
      reset();
      setWish("");
      router.refresh();
    });
  }

  function title(change: PlanChange): string {
    if (change.action === "replace") {
      return t("ai.plan.replace", { from: change.exerciseName, to: change.newExerciseName ?? "" });
    }
    return t(`ai.plan.${change.action}`, { name: change.exerciseName });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <SparklesIcon aria-hidden />
        {t("ai.plan.open")}
      </Button>
      <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
        <DialogContent className="flex max-h-[90dvh] flex-col overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("ai.plan.title")}</DialogTitle>
            <DialogDescription>{t("ai.plan.description")}</DialogDescription>
          </DialogHeader>
          {!enabled ? (
            <div className="grid gap-3">
              <p className="text-sm">{t("ai.plan.needsConsent")}</p>
              <Button asChild className="justify-self-start">
                <Link href="/settings">{t("ai.plan.toSettings")}</Link>
              </Button>
            </div>
          ) : suggestions === null ? (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="plan-wish">{t("ai.plan.wish")}</Label>
                <textarea
                  id="plan-wish"
                  rows={4}
                  maxLength={MAX_WISH_LENGTH}
                  placeholder={t("ai.plan.placeholder")}
                  value={wish}
                  onChange={(event) => setWish(event.target.value)}
                  className="border-input bg-background w-full rounded-md border px-3 py-2 text-base"
                />
              </div>
              {pending ? (
                <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Loader2Icon className="size-4 animate-spin" aria-hidden />
                  {t("ai.plan.loading")}
                </p>
              ) : null}
              <Button onClick={request} disabled={pending || wish.trim().length < MIN_WISH_LENGTH}>
                {t("ai.plan.submit")}
              </Button>
              <p className="text-muted-foreground text-xs">{t("ai.plan.disclaimer")}</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {suggestions.summary ? <p className="text-sm">{suggestions.summary}</p> : null}
              {suggestions.changes.length === 0 ? (
                <p className="text-sm font-medium">{t("ai.plan.none")}</p>
              ) : (
                <>
                  <p className="text-sm font-medium">{t("ai.plan.changesTitle")}</p>
                  <ul className="grid gap-2">
                    {suggestions.changes.map((change) => {
                      const key = changeKey(change);
                      const checked = selected.has(key);
                      const heading = title(change);
                      return (
                        <li key={key}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={t("ai.plan.select", { title: heading })}
                            onClick={() =>
                              setSelected((current) => {
                                const next = new Set(current);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                            className={cn(
                              "grid w-full gap-1 rounded-xl border px-4 py-3 text-left",
                              checked ? "border-primary bg-primary/10" : "opacity-70",
                            )}
                          >
                            <span className="text-muted-foreground text-xs">{change.dayTitle}</span>
                            <span className="font-medium">{heading}</span>
                            {change.sets !== null && change.repMin !== null && change.repMax !== null ? (
                              <span className="text-sm tabular-nums">
                                {t("ai.plan.prescription", { sets: change.sets, min: change.repMin, max: change.repMax })}
                              </span>
                            ) : null}
                            <span className="text-muted-foreground text-sm">{change.reason}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <div className="flex flex-wrap gap-2">
                {suggestions.changes.length > 0 ? (
                  <Button onClick={apply} disabled={pending || selected.size === 0}>
                    {t("ai.plan.apply", { count: selected.size })}
                  </Button>
                ) : null}
                <Button variant="outline" onClick={reset} disabled={pending}>
                  {t("ai.plan.again")}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">{t("ai.plan.disclaimer")}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
