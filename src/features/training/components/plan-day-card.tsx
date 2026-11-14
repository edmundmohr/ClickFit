import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlayIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatClock } from "@/lib/format";
import { startWorkoutAction } from "../actions";
import type { PlanDayView } from "../services/plan-service";
import { SwapExerciseDialog } from "./swap-exercise-dialog";

interface PlanDayCardProps {
  day: PlanDayView;
  isToday: boolean;
  /** Läuft bereits ein Training, kann kein weiteres gestartet werden. */
  canStart: boolean;
}

export async function PlanDayCard({ day, isToday, canStart }: PlanDayCardProps) {
  const t = await getTranslations("training");
  return (
    <Card className={isToday ? "border-primary" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-muted-foreground text-sm">{t(`weekdays.${day.weekday}`)}</p>
            <CardTitle className="text-lg">{t(`focus.${day.focus}`)}</CardTitle>
          </div>
          <div className="flex flex-col items-end gap-1">
            {isToday ? <Badge>{t("plan.today")}</Badge> : null}
            <span className="text-muted-foreground text-sm">
              {t("plan.estimated", { minutes: day.estimatedMinutes })}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="divide-y">
          {day.exercises.map((entry) => (
            <li key={entry.id} className="flex items-center gap-2 py-2">
              <Link href={`/training/exercises/${entry.exercise.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-medium">{entry.exercise.name}</span>
                <span className="text-muted-foreground block text-sm">
                  {t(entry.exercise.type === "duration" ? "prescriptionSeconds" : "prescription", {
                    sets: entry.sets,
                    repMin: entry.repMin,
                    repMax: entry.repMax,
                  })}
                  {" · "}
                  {t("plan.rir", { rir: entry.targetRir })}
                  {" · "}
                  {t("plan.rest", { time: formatClock(entry.restSeconds) })}
                </span>
              </Link>
              <SwapExerciseDialog planExerciseId={entry.id} name={entry.exercise.name} />
            </li>
          ))}
        </ul>
        {canStart ? (
          <form action={startWorkoutAction}>
            <input type="hidden" name="planDayId" value={day.id} />
            <Button type="submit" size="lg" className="w-full" variant={isToday ? "default" : "outline"}>
              <PlayIcon aria-hidden />
              {t("plan.start")}
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
