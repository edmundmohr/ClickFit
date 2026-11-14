"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CHECK_IN_WINDOW_DAYS } from "@/domain/nutrition/adaptive";
import { useActionRunner } from "@/hooks/use-action-runner";
import { formatNumber } from "@/lib/format";
import { toDisplayWeight, weightUnitKey, type UnitSystem } from "@/lib/units";
import { applyCheckInAction } from "../actions";
import type { CheckIn } from "../services/target-service";

interface CheckInCardProps {
  checkIn: CheckIn;
  unitSystem: UnitSystem;
  /** Kurzfassung für das Tagebuch: ohne die Einzelwerte der Auswertung. */
  compact?: boolean;
}

/** Wöchentlicher Check-in: Auswertung von Zufuhr und Gewichtstrend mit Vorschlag für neue Ziele. */
export function CheckInCard({ checkIn, unitSystem, compact }: CheckInCardProps) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const { analysis, proposal } = checkIn;
  const unit = t(`training.units.${weightUnitKey(unitSystem)}`);
  const trend =
    analysis.trendChangeKg === null
      ? t("nutrition.targets.checkIn.noTrend")
      : t("nutrition.targets.checkIn.trend", {
          value: `${analysis.trendChangeKg > 0 ? "+" : ""}${formatNumber(toDisplayWeight(Math.abs(analysis.trendChangeKg), unitSystem) * Math.sign(analysis.trendChangeKg), 2)}`,
          unit,
        });

  return (
    <Card className={checkIn.due ? "border-primary" : undefined}>
      <CardHeader>
        <CardTitle>
          {checkIn.due ? t("nutrition.targets.checkIn.due") : t("nutrition.targets.checkIn.title")}
        </CardTitle>
        <CardDescription>{t("nutrition.targets.checkIn.text")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {compact ? null : (
          <ul className="grid gap-1">
            <li>
              {t("nutrition.targets.checkIn.loggedDays", { count: analysis.loggedDays, total: CHECK_IN_WINDOW_DAYS })}
            </li>
            {analysis.avgIntakeKcal !== null ? (
              <li>{t("nutrition.targets.checkIn.avgIntake", { value: formatNumber(analysis.avgIntakeKcal, 0) })}</li>
            ) : null}
            <li>{trend}</li>
            <li>{t("nutrition.targets.checkIn.tdee", { value: formatNumber(analysis.tdeeKcal, 0) })}</li>
            <li>{t("nutrition.targets.checkIn.confidence", { value: Math.round(analysis.confidence * 100) })}</li>
          </ul>
        )}
        {analysis.confidence === 0 ? (
          <p className="text-muted-foreground">{t("nutrition.targets.checkIn.lowData")}</p>
        ) : null}
        <p className="font-medium">
          {t("nutrition.targets.checkIn.proposal", {
            kcal: formatNumber(proposal.kcal, 0),
            protein: proposal.proteinG,
            carbs: proposal.carbsG,
            fat: proposal.fatG,
          })}
        </p>
        {checkIn.due ? (
          <Button
            className="justify-self-start"
            disabled={pending}
            onClick={() => run(applyCheckInAction, () => toast.success(t("nutrition.targets.checkIn.applied")))}
          >
            {t("nutrition.targets.checkIn.apply")}
          </Button>
        ) : (
          <p className="text-muted-foreground">{t("nutrition.targets.checkIn.notDue")}</p>
        )}
      </CardContent>
    </Card>
  );
}
