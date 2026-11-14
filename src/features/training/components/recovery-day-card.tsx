import { getTranslations } from "next-intl/server";
import { PlayIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startRecoveryWorkoutAction } from "../actions";
import type { RecoveryDayView } from "../services/recovery-day-service";

/** Erholungsorientierter Modus: Vorschlag für heute aus den frischesten Muskelgruppen. */
export async function RecoveryDayCard({ day, canStart }: { day: RecoveryDayView; canStart: boolean }) {
  const t = await getTranslations();
  return (
    <Card className="border-primary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="text-primary size-5" aria-hidden />
          {t("training.recoveryMode.title")}
        </CardTitle>
        <CardDescription>
          {day.restRecommended
            ? t("training.recoveryMode.rest")
            : t("training.recoveryMode.text", {
                muscles: day.focus.map((muscle) => t(`muscles.${muscle}`)).join(", "),
              })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y">
          {day.exercises.map((entry) => (
            <li key={entry.exerciseId} className="py-2">
              <span className="block truncate font-medium">{entry.exercise.name}</span>
              <span className="text-muted-foreground block text-sm">
                {t(entry.exercise.type === "duration" ? "training.prescriptionSeconds" : "training.prescription", {
                  sets: entry.sets,
                  repMin: entry.repMin,
                  repMax: entry.repMax,
                })}
              </span>
            </li>
          ))}
        </ul>
        {canStart && day.exercises.length > 0 ? (
          <form action={startRecoveryWorkoutAction}>
            <Button type="submit" size="lg" className="w-full" variant={day.restRecommended ? "outline" : "default"}>
              <PlayIcon aria-hidden />
              {t("training.recoveryMode.start")}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
