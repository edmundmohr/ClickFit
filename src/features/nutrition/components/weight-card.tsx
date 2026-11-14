"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ScaleIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { LocalDate } from "@/lib/dates";
import { formatDayShort, formatNumber } from "@/lib/format";
import { fromDisplayWeight, parseDecimal, toDisplayWeight, weightUnitKey, type UnitSystem } from "@/lib/units";
import { saveWeightAction } from "../actions";
import type { WeightStatus } from "../services/tracking-service";

interface WeightCardProps {
  /** `null` speichert für „heute“ zum Zeitpunkt des Klicks. */
  date: LocalDate | null;
  status: WeightStatus;
  unitSystem: UnitSystem;
}

/** Schnelles Eintragen des Körpergewichts; zeigt den geglätteten Trend. */
export function WeightCard({ date, status, unitSystem }: WeightCardProps) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const unit = t(`training.units.${weightUnitKey(unitSystem)}`);
  const display = (kg: number) => formatNumber(toDisplayWeight(kg, unitSystem));
  const [value, setValue] = useState(status.today === null ? "" : display(status.today));

  function save() {
    const parsed = parseDecimal(value);
    if (parsed === null) return;
    run(
      () => saveWeightAction(date, fromDisplayWeight(parsed, unitSystem)),
      () => toast.success(t("nutrition.weight.saved")),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScaleIcon className="text-muted-foreground size-5" aria-hidden />
          {t("nutrition.weight.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex gap-2">
          <Input
            inputMode="decimal"
            aria-label={t("nutrition.weight.today", { unit })}
            placeholder={t("nutrition.weight.today", { unit })}
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <Button onClick={save} disabled={pending || parseDecimal(value) === null}>
            {t("nutrition.weight.save")}
          </Button>
        </div>
        {status.latest ? (
          <p className="text-muted-foreground text-sm">
            {t("nutrition.weight.trend", { value: display(status.latest.trendKg), unit })}
            {" · "}
            {t("nutrition.weight.last", {
              value: display(status.latest.weightKg),
              unit,
              date: formatDayShort(status.latest.date),
            })}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">{t("nutrition.weight.empty")}</p>
        )}
      </CardContent>
    </Card>
  );
}
