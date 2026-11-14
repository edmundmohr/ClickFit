"use client";

import { useTranslations } from "next-intl";
import { TrophyIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Illustration } from "@/components/illustration";
import { detectRecords, sessionTotals, type RecordType } from "@/domain/training/records";
import { formatNumber } from "@/lib/format";
import { toDisplayWeight, weightUnitKey, type UnitSystem } from "@/lib/units";
import { toLoggedSet, type ExerciseDraft } from "./workout-state";

interface WorkoutSummaryProps {
  exercises: ExerciseDraft[];
  durationMinutes: number | null;
  unitSystem: UnitSystem;
}

const WEIGHT_RECORDS: RecordType[] = ["weight", "one_rep_max", "set_volume"];

/** Zusammenfassung nach dem Training: Dauer, Volumen, Sätze und neue Rekorde. */
export function WorkoutSummary({ exercises, durationMinutes, unitSystem }: WorkoutSummaryProps) {
  const t = useTranslations();
  const unit = t(`training.units.${weightUnitKey(unitSystem)}`);
  const logged = exercises.map((exercise) => ({
    exercise,
    sets: exercise.sets.map((set) => toLoggedSet(exercise, set)),
  }));
  const totals = sessionTotals(logged.flatMap((entry) => entry.sets));
  const records = logged.flatMap((entry) =>
    detectRecords(entry.sets, entry.exercise.bests).map((record) => ({ ...record, name: entry.exercise.name })),
  );

  const stats = [
    {
      label: t("workout.summary.duration"),
      value: durationMinutes === null ? "–" : t("workout.summary.minutes", { minutes: durationMinutes }),
    },
    {
      label: t("workout.summary.volume"),
      value: `${formatNumber(toDisplayWeight(totals.volumeKg, unitSystem), 0)} ${unit}`,
    },
    { label: t("workout.summary.sets"), value: String(totals.completedSets) },
  ];

  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle>{t("workout.summary.title")}</CardTitle>
        <CardDescription>{t("workout.summary.editHint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Illustration name="workout-done" />
        <dl className="grid grid-cols-3 gap-2 text-center">
          {stats.map((stat) => (
            <div key={stat.label} className="bg-secondary rounded-lg px-2 py-3">
              <dt className="text-muted-foreground text-xs">{stat.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>
        <div>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <TrophyIcon className="size-4 text-amber-500" aria-hidden />
            {t("workout.summary.records")}
          </h3>
          {records.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("workout.summary.noRecords")}</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {records.map((record) => (
                <li key={`${record.name}-${record.type}`}>
                  <span className="font-medium">{record.name}</span>
                  {": "}
                  {t(`workout.records.${record.type}`)}
                  {" – "}
                  {WEIGHT_RECORDS.includes(record.type)
                    ? `${formatNumber(toDisplayWeight(record.value, unitSystem))} ${unit}`
                    : formatNumber(record.value, 0)}
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
