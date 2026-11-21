import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PencilIcon, PlayIcon, TimerIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { estimateDaySeconds, shortenDay } from "@/domain/training/adaptation";
import { groupConsecutive, groupKind } from "@/domain/training/supersets";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PlanDayView, PlanExerciseView } from "../services/plan-service";
import { routineTitle } from "../titles";
import { ExerciseQuickInfoDialog } from "./exercise-quick-info-dialog";
import { StartWorkoutForm } from "./start-workout-form";
import { SwapExerciseDialog } from "./swap-exercise-dialog";

interface PlanDayCardProps {
  day: PlanDayView;
  isToday: boolean;
  /** Läuft bereits ein Training, kann kein weiteres gestartet werden. */
  canStart: boolean;
  /** Tauschen ist nur im Wochenplan sinnvoll; in der Routinen-Übersicht wird im Builder bearbeitet. */
  allowSwap?: boolean;
}

/** Geschätzte Dauer der Kurzvariante in Minuten. */
function shortMinutes(day: PlanDayView): number {
  const short = shortenDay(
    day.exercises.map((entry) => ({
      entry: { exerciseId: entry.exercise.id, sets: entry.sets, restSeconds: entry.restSeconds, groupId: entry.groupId },
      exercise: entry.exercise,
    })),
  );
  return Math.round(estimateDaySeconds(short) / 60);
}

export async function PlanDayCard({ day, isToday, canStart, allowSwap = true }: PlanDayCardProps) {
  const t = await getTranslations("training");

  const renderExercise = (entry: PlanExerciseView) => (
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
        {entry.replaces && entry.reason ? (
          <span className="block text-sm text-amber-600 dark:text-amber-400">
            {t("plan.replaces", { name: entry.replaces.name })}
            {" · "}
            {t(`plan.reasons.${entry.reason}`)}
          </span>
        ) : null}
      </Link>
      <ExerciseQuickInfoDialog exerciseId={entry.exercise.id} name={entry.exercise.name} instructions={entry.exercise.instructions} />
      {allowSwap && !entry.replaces ? (
        <SwapExerciseDialog planExerciseId={entry.id} name={entry.exercise.name} />
      ) : null}
    </li>
  );

  return (
    <Card className={isToday ? "border-primary" : undefined}>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-muted-foreground text-sm">
              {day.weekday === null ? t("plan.noDay") : t(`weekdays.${day.weekday}`)}
            </p>
            <CardTitle className="truncate text-lg">{routineTitle(day, (focus) => t(`focus.${focus}`))}</CardTitle>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {isToday ? <Badge>{t("plan.today")}</Badge> : null}
            <span className="text-muted-foreground text-sm">
              {t("plan.estimated", { minutes: day.estimatedMinutes })}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {day.exercises.length === 0 ? <p className="text-muted-foreground text-sm">{t("plan.emptyDay")}</p> : null}
        <ul className="divide-y">
          {groupConsecutive(day.exercises).map((group) => {
            const kind = groupKind(group.items.length);
            if (!kind || group.groupId === null) return group.items.map(renderExercise);
            return (
              <li key={group.groupId} className="py-2">
                <p className="text-primary text-xs font-semibold tracking-wide uppercase">{t(`plan.group.${kind}`)}</p>
                <ul className={cn("border-primary divide-y border-l-2 pl-3")}>{group.items.map(renderExercise)}</ul>
              </li>
            );
          })}
        </ul>
        {day.dropped.length > 0 ? (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {t("plan.dropped", { names: day.dropped.map((item) => item.exercise.name).join(", ") })}
          </p>
        ) : null}
        <div className="grid gap-2">
          {canStart && day.exercises.length > 0 ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <StartWorkoutForm planDayId={day.id}>
                <Button type="submit" size="lg" className="w-full" variant={isToday ? "default" : "outline"}>
                  <PlayIcon aria-hidden />
                  {t("plan.start")}
                </Button>
              </StartWorkoutForm>
              <StartWorkoutForm planDayId={day.id} short>
                <Button type="submit" size="lg" variant="outline">
                  <TimerIcon aria-hidden />
                  {t("plan.startShort", { minutes: shortMinutes(day) })}
                </Button>
              </StartWorkoutForm>
            </div>
          ) : null}
          <Button asChild variant="ghost" className="justify-self-start">
            <Link href={`/training/routines/${day.id}`}>
              <PencilIcon aria-hidden />
              {t("plan.edit")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
