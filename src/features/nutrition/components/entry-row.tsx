"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { useActionRunner } from "@/hooks/use-action-runner";
import { formatNumber } from "@/lib/format";
import { parseDecimal } from "@/lib/units";
import { deleteLogEntryAction, updateLogAmountAction } from "../actions";
import type { LogEntryView } from "../services/diary-service";

/** Ein Eintrag im Tagebuch; ein Tipp öffnet Menge ändern und Löschen. */
export function EntryRow({ entry }: { entry: LogEntryView }) {
  const t = useTranslations("nutrition");
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(entry.amount).replace(".", ","));
  const unit = t(`units.${entry.amountUnit}`);

  function save() {
    const value = parseDecimal(amount);
    if (value === null || value <= 0) return;
    run(
      () => updateLogAmountAction(entry.id, value),
      () => {
        toast.success(t("diary.entryUpdated"));
        setOpen(false);
      },
    );
  }

  function remove() {
    run(
      () => deleteLogEntryAction(entry.id),
      () => {
        toast.success(t("diary.entryDeleted"));
        setOpen(false);
      },
    );
  }

  return (
    <>
      <button
        type="button"
        aria-label={t("diary.entryLabel", { name: entry.name })}
        onClick={() => setOpen(true)}
        className="hover:bg-accent/60 -mx-2 flex min-h-12 w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1.5 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{entry.name}</span>
          <span className="text-muted-foreground block text-xs">
            {formatNumber(entry.amount)} {unit}
            {" · "}
            {t("macros.proteinShort")} {formatNumber(entry.proteinG, 0)}
            {" · "}
            {t("macros.carbsShort")} {formatNumber(entry.carbsG, 0)}
            {" · "}
            {t("macros.fatShort")} {formatNumber(entry.fatG, 0)}
          </span>
        </span>
        <span className="text-sm tabular-nums">{t("macros.kcalValue", { value: formatNumber(entry.kcal, 0) })}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="pr-8">{t("diary.editTitle", { name: entry.name })}</DialogTitle>
            <DialogDescription>
              {t("macros.line", {
                kcal: formatNumber(entry.kcal, 0),
                protein: formatNumber(entry.proteinG, 0),
                carbs: formatNumber(entry.carbsG, 0),
                fat: formatNumber(entry.fatG, 0),
              })}
            </DialogDescription>
          </DialogHeader>
          <Field
            id={`amount-${entry.id}`}
            label={`${t("diary.amount")} (${unit})`}
            inputMode="decimal"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button variant="ghost" className="text-destructive" onClick={remove} disabled={pending}>
              <Trash2Icon aria-hidden />
              {t("diary.deleteEntry")}
            </Button>
            <Button onClick={save} disabled={pending}>
              {t("add.submit")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
