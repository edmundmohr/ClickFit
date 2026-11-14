import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2Icon, CheckIcon, FlameIcon, MoonIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Illustration } from "@/components/illustration";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { startWorkoutAction } from "@/features/training/actions";
import { OnboardingPrompt } from "@/features/training/components/onboarding-prompt";
import { getTrainingStats, listSessionsBetween } from "@/features/training/services/history-service";
import { getActivePlan, type PlanDayView } from "@/features/training/services/plan-service";
import { getInProgressSession } from "@/features/training/services/workout-service";
import { WEEKDAYS } from "@/domain/training/types";
import { addDays, startOfWeek, toLocalDate, weekdayOf } from "@/lib/dates";
import { formatTime } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import { cn } from "@/lib/utils";

/** Nächster Trainingstag nach heute (innerhalb der kommenden Woche). */
function nextPlanDay(days: PlanDayView[], todayWeekday: number): PlanDayView | null {
  for (let offset = 1; offset <= 7; offset++) {
    const weekday = ((todayWeekday - 1 + offset) % 7) + 1;
    const match = days.find((day) => day.weekday === weekday);
    if (match) return match;
  }
  return null;
}

export default async function TodayPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const db = getDb();
  const today = toLocalDate(new Date());
  const todayWeekday = weekdayOf(today);
  const plan = await getActivePlan(db, user.id);

  if (!plan) {
    return (
      <>
        <PageHeader title={t("home.greeting", { name: user.name })} />
        <OnboardingPrompt
          title={t("home.onboardingTitle")}
          text={t("home.onboardingText")}
          action={t("home.onboardingStart")}
        />
      </>
    );
  }

  const plannedWeekdays = plan.days.map((day) => day.weekday);
  const [running, stats, todaySessions] = await Promise.all([
    getInProgressSession(db, user.id),
    getTrainingStats(db, user.id, plannedWeekdays, today),
    listSessionsBetween(db, user.id, today, today),
  ]);
  const todayDay = plan.days.find((day) => day.weekday === todayWeekday) ?? null;
  const doneToday = todaySessions[0] ?? null;
  const upcoming = nextPlanDay(plan.days, todayWeekday);
  const monday = startOfWeek(today);

  return (
    <>
      <PageHeader title={t("home.greeting", { name: user.name })} />
      <div className="grid gap-4">
        {running ? (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle>{t("training.plan.runningTitle")}</CardTitle>
              <CardDescription>
                {t("training.plan.runningText", { time: formatTime(running.startedAt) })}
              </CardDescription>
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
        ) : doneToday ? (
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
        ) : todayDay ? (
          <Card className="border-primary">
            <CardHeader>
              <CardDescription>{t("home.todayWorkout")}</CardDescription>
              <CardTitle className="text-xl">{t(`training.focus.${todayDay.focus}`)}</CardTitle>
              <CardDescription>
                {t("training.plan.exercises", { count: todayDay.exercises.length })}
                {" · "}
                {t("training.plan.estimated", { minutes: todayDay.estimatedMinutes })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action={startWorkoutAction}>
                <input type="hidden" name="planDayId" value={todayDay.id} />
                <Button type="submit" size="lg" className="w-full">
                  <PlayIcon aria-hidden />
                  {t("training.plan.start")}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MoonIcon className="text-muted-foreground size-5" aria-hidden />
                {t("home.restDayTitle")}
              </CardTitle>
              {upcoming ? (
                <CardDescription>
                  {t("home.restDayText", {
                    weekday: t(`training.weekdays.${upcoming.weekday}`),
                    focus: t(`training.focus.${upcoming.focus}`),
                  })}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <Illustration name="rest-day" />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardDescription className="flex items-center gap-1.5">
              <FlameIcon className="size-4 text-orange-500" aria-hidden />
              {t("home.streakTitle")}
            </CardDescription>
            <CardTitle className="text-3xl tabular-nums">{stats.streak}</CardTitle>
            <CardDescription>{t("home.streakValue", { count: stats.streak })}</CardDescription>
          </CardHeader>
        </Card>
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
        <p className="text-muted-foreground text-sm">{t("home.streakHint")}</p>
        <p className="text-muted-foreground text-sm">{t("home.moreSoon")}</p>
      </div>
    </>
  );
}
