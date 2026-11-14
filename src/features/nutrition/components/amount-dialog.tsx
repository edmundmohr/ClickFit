"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/forms/field";
import { Chip } from "@/components/forms/choice";
import { allowedUnits, macrosForAmount } from "@/domain/nutrition/macros";
import type { AmountUnit, FoodItem } from "@/domain/nutrition/types";
import { formatNumber } from "@/lib/format";
import { parseDecimal } from "@/lib/units";

export interface AmountPreset {
  amount: number;
  amountUnit: AmountUnit;
}

interface AmountDialogProps {
  food: FoodItem;
  preset?: AmountPreset;
  pending: boolean;
  onSubmit: (amount: number, unit: AmountUnit) => void;
  onClose: () => void;
}

const DEFAULT_GRAMS = 100;

function initialAmount(food: FoodItem, preset: AmountPreset | undefined, units: AmountUnit[]): AmountPreset {
  if (preset && units.includes(preset.amountUnit)) return preset;
  if (food.basis === "serving") return { amount: 1, amountUnit: "serving" };
  // Ist eine Portionsgröße bekannt, ist sie der sinnvollste Startwert.
  return { amount: food.servingSize ?? DEFAULT_GRAMS, amountUnit: food.basis };
}

/** Menge und Einheit für ein gewähltes Lebensmittel, mit Vorschau der Nährwerte. */
export function AmountDialog({ food, preset, pending, onSubmit, onClose }: AmountDialogProps) {
  const t = useTranslations("nutrition");
  const units = allowedUnits(food);
  const start = initialAmount(food, preset, units);
  const [amountText, setAmountText] = useState(String(start.amount).replace(".", ","));
  const [unit, setUnit] = useState<AmountUnit>(start.amountUnit);

  const amount = parseDecimal(amountText);
  const macros = amount !== null && amount > 0 ? macrosForAmount(food, amount, unit) : null;
  const basisUnit = food.basis === "serving" ? "g" : food.basis;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-8">{t("add.amountTitle", { name: food.name })}</DialogTitle>
          <DialogDescription>
            {[food.brand, t(`add.sources.${food.source}`)].filter(Boolean).join(" · ")}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (amount !== null && macros) onSubmit(amount, unit);
          }}
        >
          <Field
            id="food-amount"
            label={t("add.amount")}
            inputMode="decimal"
            autoFocus
            value={amountText}
            onChange={(event) => setAmountText(event.target.value)}
            onFocus={(event) => event.target.select()}
            hint={
              food.servingSize && food.basis !== "serving"
                ? t("add.servingHint", { size: formatNumber(food.servingSize), unit: t(`units.${basisUnit}`) })
                : undefined
            }
          />
          {units.length > 1 ? (
            <div role="radiogroup" aria-label={t("add.unit")} className="flex gap-2">
              {units.map((option) => (
                <Chip key={option} role="radio" selected={unit === option} onToggle={() => setUnit(option)}>
                  {option === "serving" ? (food.servingLabel ?? t("units.serving")) : t(`units.${option}`)}
                </Chip>
              ))}
            </div>
          ) : null}
          <p className="bg-secondary rounded-lg px-3 py-2 text-sm tabular-nums" aria-live="polite">
            {macros
              ? t("macros.line", {
                  kcal: formatNumber(macros.kcal, 0),
                  protein: formatNumber(macros.proteinG),
                  carbs: formatNumber(macros.carbsG),
                  fat: formatNumber(macros.fatG),
                })
              : "–"}
          </p>
          <DialogFooter>
            <Button type="submit" size="lg" disabled={pending || !macros}>
              {t("add.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
