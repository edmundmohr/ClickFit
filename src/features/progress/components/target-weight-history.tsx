import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { TargetWeightChangeView } from "@/features/training/services/routine-service";
import { formatDayShort, formatNumber } from "@/lib/format";
import { toDisplayWeight, weightUnitKey, type UnitSystem } from "@/lib/units";

interface TargetWeightHistoryProps {
  changes: TargetWeightChangeView[];
  unitSystem: UnitSystem;
}

/** Verlauf der eigenen Zielgewichte einer Übung (aus dem Routine-Editor), neueste zuerst. */
export async function TargetWeightHistory({ changes, unitSystem }: TargetWeightHistoryProps) {
  if (changes.length === 0) return null;
  const t = await getTranslations();
  const unit = t(`training.units.${weightUnitKey(unitSystem)}`);
  const weight = (kg: number | null) =>
    kg === null
      ? t("progress.strength.targetWeightAuto")
      : t("progress.strength.recordValue", { value: formatNumber(toDisplayWeight(kg, unitSystem), 2), unit });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("progress.strength.targetWeightTitle")}</CardTitle>
        <CardDescription>{t("progress.strength.targetWeightHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="divide-y">
          {changes.map((change) => {
            const date = formatDayShort(change.date, true);
            return (
              <li key={change.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-muted-foreground min-w-0 truncate">
                  {change.routineName ? t("progress.strength.targetWeightRoutine", { date, routine: change.routineName }) : date}
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {t("progress.strength.targetWeightChange", { from: weight(change.fromKg), to: weight(change.toKg) })}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
