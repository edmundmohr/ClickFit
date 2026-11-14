import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ActivityIcon, CheckCircle2Icon, CheckIcon, FlameIcon, MoonIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Illustration } from "@/components/illustration";
import { MUSCLES } from "@/domain/exercises/types";
import { recoveryLevel } from "@/domain/progress/recovery";
import { WEEKDAYS, type Weekday } from "@/domain/training/types";
import { WeightCard } from "@/features/nutrition/components/weight-card";
import { getWeightStatus } from "@/features/nutrition/services/tracking-service";
import { getRecoverySnapshot } from "@/features/progress/services/recovery-service";
import { StartWorkoutForm } from "@/features/training/components/start-workout-form";
import { getUserCatalog } from "@/features/training/services/exercise-service";
import { routineTitle } from "@/features/training/titles";
import type { SessionSummary, TrainingStats } from "@/features/training/services/history-service";
import type { PlanDayView } from "@/features/training/services/plan-service";
import { addDays, startOfWeek, type LocalDate } from "@/lib/dates";
import { formatTime } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import type { UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";

export interface TrainingToday {
  running: { id: string; startedAt: Date } | null;
  doneToday: SessionSummary | null;
  todayDay: PlanDayView | null;
  upcoming: PlanDayView | null;
}

/** Kachel „Heutiges Training“: laufendes, erledigtes oder geplantes Training bzw. Ruhetag. */
export async function TrainingWidget({ training }: { training: TrainingToday }) {
  const t = await getTranslations();
  const { running, doneToday, todayDay, upcoming } = training;
  if (running) {
    return (
      <Card className="border-primary">
        <CardHeader>
          <CardTitle>{t("training.plan.runningTitle")}</CardTitle>
          <CardDescription>{t("training.plan.runningText", { time: formatTime(running.startedAt) })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="w-full">
            <Link href={`/workout/${running.id}`}>
              <PlayIcon aria-hidden />
              {t("training.plan.continue")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (doneToday) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2Icon className="text-primary size-5" aria-hidden />
            {t("home.doneTitle")}
          </CardTitle>
          <CardDescription>
            {t("home.doneText", { sets: doneToday.completedSets, minutes: doneToday.durationMinutes ?? 0 })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href={`/workout/${doneToday.id}`}>{t("home.viewWorkout")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }
  if (todayDay) {
    return (
      <Card className="border-primary">
        <CardHeader>
          <CardDescription>{t("home.todayWorkout")}</CardDescription>
          <CardTitle className="text-xl">
            {routineTitle(todayDay, (focus) => t(`training.focus.${focus}`))}
          </CardTitle>
          <CardDescription>
            {t("training.plan.exercises", { count: todayDay.exercises.length })}
            {" · "}
            {t("training.plan.estimated", { minutes: todayDay.estimatedMinutes })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StartWorkoutForm planDayId={todayDay.id}>
            <Button type="submit" size="lg" className="w-full">
              <PlayIcon aria-hidden />
              {t("training.plan.start")}
            </Button>
          </StartWorkoutForm>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MoonIcon className="text-muted-foreground size-5" aria-hidden />
          {t("home.restDayTitle")}
        </CardTitle>
        {upcoming && upcoming.weekday !== null ? (
          <CardDescription>
            {t("home.restDayText", {
              weekday: t(`training.weekdays.${upcoming.weekday}`),
              focus: routineTitle(upcoming, (focus) => t(`training.focus.${focus}`)),
            })}
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent>
        <Illustration name="rest-day" />
      </CardContent>
    </Card>
  );
}

export async function StreakWidget({ stats }: { stats: TrainingStats }) {
  const t = await getTranslations("home");
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <FlameIcon className="size-4 text-orange-500" aria-hidden />
          {t("streakTitle")}
        </CardDescription>
        <CardTitle className="text-3xl tabular-nums">{stats.streak}</CardTitle>
        <CardDescription>
          {t("streakValue", { count: stats.streak })}
          {" · "}
          {t("streakHint")}
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

interface WeekWidgetProps {
  stats: TrainingStats;
  plannedWeekdays: Weekday[];
  today: LocalDate;
}

export async function WeekWidget({ stats, plannedWeekdays, today }: WeekWidgetProps) {
  const t = await getTranslations();
  const monday = startOfWeek(today);
  return (
    <Card>
      <CardHeader>
        <CardDescription>{t("home.weekTitle")}</CardDescription>
        <CardTitle className="text-base">
          {t("home.weekValue", { done: stats.doneThisWeek.length, planned: plannedWeekdays.length })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="grid grid-cols-7 gap-1.5 text-center">
          {WEEKDAYS.map((weekday) => {
            const date = addDays(monday, weekday - 1);
            const done = stats.doneThisWeek.includes(date);
            const planned = plannedWeekdays.includes(weekday);
            return (
              <li key={weekday} className="grid justify-items-center gap-1">
                <span className="text-muted-foreground text-xs">{t(`training.weekdaysShort.${weekday}`)}</span>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full",
                    done
                      ? "bg-primary text-primary-foreground"
                      : planned
                        ? "border-primary border-2 border-dashed"
                        : "bg-secondary",
                    date === today && "ring-ring ring-2 ring-offset-2 ring-offset-transparent",
                  )}
                >
                  {done ? <CheckIcon className="size-4" /> : null}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}

const WEIGHT_LOOKBACK_DAYS = 90;

export async function WeightWidget({ userId, today, unitSystem }: { userId: string; today: LocalDate; unitSystem: UnitSystem }) {
  const status = await getWeightStatus(getDb(), userId, addDays(today, -WEIGHT_LOOKBACK_DAYS), today);
  // Ohne Datum speichert der Server für „heute“ zum Zeitpunkt des Klicks.
  return <WeightCard key={`${today}-${status.today}`} date={null} status={status} unitSystem={unitSystem} />;
}

const MUSCLES_SHOWN = 3;

/** Kachel „Erholung“: die am stärksten ermüdeten Muskelgruppen. */
export async function RecoveryWidget({ userId }: { userId: string }) {
  const t = await getTranslations();
  const db = getDb();
  const catalog = await getUserCatalog(db, userId);
  const status = await getRecoverySnapshot(db, userId, catalog.find);
  const tired = MUSCLES.filter((muscle) => recoveryLevel(status[muscle]) !== "fresh")
    .sort((a, b) => status[a] - status[b])
    .slice(0, MUSCLES_SHOWN);

  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <ActivityIcon className="size-4" aria-hidden />
          {t("progress.dashboard.recoveryTitle")}
        </CardDescription>
        <CardTitle className="text-base">
          {tired.length === 0 ? t("progress.dashboard.recoveryAllFresh") : t("progress.dashboard.recoveryFatigued")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {tired.length > 0 ? (
          <ul className="grid gap-1 text-sm">
            {tired.map((muscle) => (
              <li key={muscle} className="flex justify-between gap-2">
                <span>{t(`muscles.${muscle}`)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {t("progress.muscles.recoveryValue", { value: status[muscle] })}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <Button asChild variant="outline" className="justify-self-start">
          <Link href="/progress/muscles">{t("progress.dashboard.recoveryOpen")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
