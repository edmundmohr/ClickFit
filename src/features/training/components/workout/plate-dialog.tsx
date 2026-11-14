"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculatePlates, fromKg, type BarSetup } from "@/domain/training/weights";
import { formatNumber } from "@/lib/format";
import { parseDecimal } from "@/lib/units";
import { parseWeightKg, toInputText, type ExerciseDraft } from "./workout-state";

/** Breite einer Scheibe in der Grafik: schwerere Scheiben sind höher. */
function plateHeight(weight: number, heaviest: number): number {
  const MIN_PERCENT = 40;
  return MIN_PERCENT + (100 - MIN_PERCENT) * (weight / heaviest);
}

function PlateResult({ target, bar }: { target: number; bar: BarSetup }) {
  const t = useTranslations();
  const unit = t(`training.units.${bar.unit}`);
  const load = calculatePlates(target, bar);
  const heaviest = Math.max(...bar.plates.map((plate) => plate.weight), 1);

  return (
    <div className="grid gap-3">
      <p className="text-sm">
        {t("workout.plates.bar", { weight: formatNumber(bar.barWeight, 2), unit })}
      </p>
      {load.perSide.length === 0 ? (
        <p className="font-medium">{t("workout.plates.empty")}</p>
      ) : (
        <>
          <p className="text-sm font-medium">{t("workout.plates.perSide")}</p>
          <div aria-hidden className="flex h-24 items-center gap-1 overflow-x-auto">
            <span className="bg-muted-foreground/60 h-3 w-6 shrink-0 rounded-l" />
            {load.perSide.map((weight, index) => (
              <span
                key={`${weight}-${index}`}
                style={{ height: `${plateHeight(weight, heaviest)}%` }}
                className="bg-primary text-primary-foreground flex w-9 shrink-0 items-center justify-center rounded-sm text-xs font-semibold tabular-nums"
              >
                {formatNumber(weight, 2)}
              </span>
            ))}
            <span className="bg-muted-foreground/60 h-3 w-4 shrink-0 rounded-r" />
          </div>
          <p className="text-lg font-semibold tabular-nums">
            {load.perSide.map((weight) => formatNumber(weight, 2)).join(" + ")} {unit}
          </p>
        </>
      )}
      <p className="text-sm tabular-nums">
        {t("workout.plates.total", { weight: formatNumber(load.total, 2), unit })}
      </p>
      {load.missing > 0.001 ? (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {t("workout.plates.missing", { weight: formatNumber(load.missing, 2), unit })}
        </p>
      ) : null}
    </div>
  );
}

function PlateCalculator({ exercise, bar }: { exercise: ExerciseDraft; bar: BarSetup }) {
  const t = useTranslations();
  // Vorbelegt mit dem nächsten offenen Satz: Das ist das Gewicht, das gleich aufgelegt wird.
  const nextSet = exercise.sets.find((set) => !set.completed) ?? exercise.sets.at(-1);
  const initialKg = nextSet ? parseWeightKg(nextSet, exercise.unit) : null;
  const [text, setText] = useState(() =>
    toInputText(initialKg === null ? null : Math.round(fromKg(initialKg, bar.unit) * 100) / 100),
  );
  const target = parseDecimal(text);
  const unit = t(`training.units.${bar.unit}`);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="plate-target">{t("workout.plates.target", { unit })}</Label>
        <Input
          id="plate-target"
          inputMode="decimal"
          autoComplete="off"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onFocus={(event) => event.target.select()}
        />
      </div>
      {target === null ? (
        <p className="text-muted-foreground text-sm">{t("workout.plates.enterWeight")}</p>
      ) : (
        <PlateResult target={target} bar={bar} />
      )}
    </div>
  );
}

/** Scheiben-Rechner: zeigt, welche Scheiben pro Seite auf die Stange kommen. */
export function PlateDialog({ exercise, onClose }: { exercise: ExerciseDraft | null; onClose: () => void }) {
  const t = useTranslations("workout.plates");
  return (
    <Dialog open={exercise !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{exercise?.name}</DialogDescription>
        </DialogHeader>
        {exercise?.bar ? <PlateCalculator key={exercise.id} exercise={exercise} bar={exercise.bar} /> : null}
      </DialogContent>
    </Dialog>
  );
}
