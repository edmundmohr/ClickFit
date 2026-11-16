import { getTranslations } from "next-intl/server";
import { PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExerciseQuickInfoDialog } from "./exercise-quick-info-dialog";
import { startFocusWorkoutAction } from "../actions";
import type { FocusDayView } from "../services/focus-day-service";

/** Vorschau der Fokus-Einheit mit Start-Knopf. */
export async function FocusDayCard({ day, canStart }: { day: FocusDayView; canStart: boolean }) {
  const t = await getTranslations();
  const areaNames = day.areas.map((area) => t(`training.focusTraining.areas.${area}`)).join(", ");

  if (day.areas.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("training.focusTraining.chooseArea")}</p>;
  }
  if (day.exercises.length === 0) {
    return <p className="text-muted-foreground text-sm">{t("training.focusTraining.noExercises")}</p>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("training.focusTraining.sessionName", { areas: areaNames })}</CardTitle>
        <CardDescription>
          {t("training.plan.exercises", { count: day.exercises.length })} ·{" "}
          {t("training.plan.estimated", { minutes: day.estimatedMinutes })}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y">
          {day.exercises.map((entry) => (
            <li key={entry.exerciseId} className="flex items-center gap-2 py-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{entry.exercise.name}</span>
                <span className="text-muted-foreground block text-sm">
                {t(entry.exercise.type === "duration" ? "training.prescriptionSeconds" : "training.prescription", {
                  sets: entry.sets,
                  repMin: entry.repMin,
                  repMax: entry.repMax,
                  })}
                </span>
              </span>
              <ExerciseQuickInfoDialog name={entry.exercise.name} instructions={entry.exercise.instructions} />
            </li>
          ))}
        </ul>
        {canStart ? (
          <form action={startFocusWorkoutAction}>
            <input type="hidden" name="areas" value={day.areas.join(",")} />
            <input type="hidden" name="minutes" value={day.minutes} />
            <Button type="submit" size="lg" className="w-full">
              <PlayIcon aria-hidden />
              {t("training.focusTraining.start")}
            </Button>
          </form>
        ) : (
          <p className="text-muted-foreground text-sm">{t("training.focusTraining.running")}</p>
        )}
      </CardContent>
    </Card>
  );
}
