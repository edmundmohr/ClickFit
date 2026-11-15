"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteWeightAction, saveWeightAction } from "@/features/nutrition/actions";
import type { WeightEntryView } from "@/features/nutrition/services/tracking-service";
import { useActionRunner } from "@/hooks/use-action-runner";
import { isValidLocalDate, type LocalDate } from "@/lib/dates";
import { formatDayShort, formatNumber } from "@/lib/format";
import { fromDisplayWeight, parseDecimal, toDisplayWeight, weightUnitKey, type UnitSystem } from "@/lib/units";

interface WeightLogPanelProps {
  today: LocalDate;
  /** Messungen im gewählten Zeitraum, neueste zuerst. */
  entries: WeightEntryView[];
  unitSystem: UnitSystem;
}

/** So viele Messungen zeigt die Liste, bevor sie aufgeklappt wird. */
const COLLAPSED_COUNT = 10;
const UNDO_TOAST_MS = 8000;

/** Gewicht für heute oder einen früheren Tag eintragen; Messungen ändern und löschen. */
export function WeightLogPanel({ today, entries, unitSystem }: WeightLogPanelProps) {
  const t = useTranslations("progress.weightLog");
  const tUnits = useTranslations("training.units");
  const { run, pending } = useActionRunner();
  const valueRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState<LocalDate>(today);
  const [value, setValue] = useState("");
  const [showAll, setShowAll] = useState(false);

  const unit = tUnits(weightUnitKey(unitSystem));
  const display = (kg: number) => formatNumber(toDisplayWeight(kg, unitSystem));
  const currentYear = today.slice(0, 4);
  const dayLabel = (day: LocalDate) => formatDayShort(day, day.slice(0, 4) !== currentYear);
  const parsed = parseDecimal(value);
  const dateValid = isValidLocalDate(date) && date <= today;
  const existing = dateValid ? entries.find((entry) => entry.date === date) : undefined;
  const visible = showAll ? entries : entries.slice(0, COLLAPSED_COUNT);

  function save() {
    if (parsed === null || !dateValid) return;
    run(
      () => saveWeightAction(date, fromDisplayWeight(parsed, unitSystem)),
      () => {
        toast.success(t("saved"));
        setValue("");
        setDate(today);
      },
    );
  }

  function edit(entry: WeightEntryView) {
    setDate(entry.date);
    setValue(display(entry.weightKg));
    valueRef.current?.focus();
    valueRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function remove(entry: WeightEntryView) {
    run(
      () => deleteWeightAction(entry.date),
      () =>
        toast.success(t("deleted"), {
          // Länger als üblich sichtbar, damit „Rückgängig“ erreichbar bleibt.
          duration: UNDO_TOAST_MS,
          action: { label: t("undo"), onClick: () => run(() => saveWeightAction(entry.date, entry.weightKg)) },
        }),
    );
  }

  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="weight-log-date">{t("date")}</Label>
            <Input
              id="weight-log-date"
              type="date"
              max={today}
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="weight-log-value">{t("value", { unit })}</Label>
            <Input
              id="weight-log-value"
              ref={valueRef}
              inputMode="decimal"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          {existing ? t("replaces", { date: dayLabel(existing.date), value: display(existing.weightKg), unit }) : t("hint")}
        </p>
        <Button type="submit" disabled={pending || parsed === null || !dateValid}>
          {t("save")}
        </Button>
      </form>

      {entries.length > 0 ? (
        <div className="grid gap-2">
          <ul className="divide-y rounded-xl border">
            {visible.map((entry) => (
              <li key={entry.date} className="flex min-h-12 items-center gap-2 py-0.5 pr-0.5 pl-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm whitespace-nowrap">{dayLabel(entry.date)}</span>
                  {entry.source === "manual" ? null : (
                    <span className="text-muted-foreground block text-xs">{t("imported")}</span>
                  )}
                </span>
                <span className="text-sm font-medium whitespace-nowrap tabular-nums">
                  {display(entry.weightKg)} {unit}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={t("edit", { date: dayLabel(entry.date) })}
                  disabled={pending}
                  onClick={() => edit(entry)}
                >
                  <PencilIcon aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={t("delete", { date: dayLabel(entry.date) })}
                  disabled={pending}
                  onClick={() => remove(entry)}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
          {entries.length > COLLAPSED_COUNT ? (
            <Button variant="outline" onClick={() => setShowAll((value) => !value)}>
              {showAll ? t("showLess") : t("showAll", { count: entries.length })}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      )}
    </div>
  );
}
