import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CheckCircle2Icon, MoonIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Illustration } from "@/components/illustration";
import type { TodayUnit } from "@/domain/training/plan-roles";
import { StartWorkoutForm } from "@/features/training/components/start-workout-form";
import type { SessionSummary } from "@/features/training/services/history-service";
import type { PlanDayView } from "@/features/training/services/plan-service";
import { routineTitle } from "@/features/training/titles";
import { formatTime } from "@/lib/format";

export interface TrainingToday {
  running: { id: string; startedAt: Date } | null;
  /** Heute geplante Einheiten aus Haupt- und Zusatzplänen, je mit Status. */
  units: TodayUnit<PlanDayView, SessionSummary>[];
  /** Heute abgeschlossene Einheiten außerhalb des Plans. */
  unplanned: SessionSummary[];
  upcoming: PlanDayView | null;
  /** Name des Plans je Plan-Kennung; nur gesetzt, wenn mehrere Pläne eingeplant sind. */
  planTitles: Record<string, string>;
}

async function RunningCard({ running }: { running: NonNullable<TrainingToday["running"]> }) {
  const t = await getTranslations();
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

async function DoneCard({ session }: { session: SessionSummary }) {
  const t = await getTranslations();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle2Icon className="text-primary size-5" aria-hidden />
          {t("home.doneTitle")}
        </CardTitle>
        <CardDescription>
          {t("home.doneText", { sets: session.completedSets, minutes: session.durationMinutes ?? 0 })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild variant="outline">
          <Link href={`/workout/${session.id}`}>{t("home.viewWorkout")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

async function PlannedCard({ day }: { day: PlanDayView }) {
  const t = await getTranslations();
  return (
    <Card className="border-primary">
      <CardHeader>
        <CardDescription>{t("home.todayWorkout")}</CardDescription>
        <CardTitle className="text-xl">{routineTitle(day, (focus) => t(`training.focus.${focus}`))}</CardTitle>
        <CardDescription>
          {t("training.plan.exercises", { count: day.exercises.length })}
          {" · "}
          {t("training.plan.estimated", { minutes: day.estimatedMinutes })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <StartWorkoutForm planDayId={day.id}>
          <Button type="submit" size="lg" className="w-full">
            <PlayIcon aria-hidden />
            {t("training.plan.start")}
          </Button>
        </StartWorkoutForm>
      </CardContent>
    </Card>
  );
}

/** Mehrere Einheiten am Tag (z. B. morgens draußen, abends zu Hause): eine Zeile je Einheit. */
async function UnitListCard({ training }: { training: TrainingToday }) {
  const t = await getTranslations();
  const firstOpen = training.units.find((unit) => !unit.done);
  const doneCount = training.units.filter((unit) => unit.done).length + training.unplanned.length;
  const title = (item: { name: string | null; focus: PlanDayView["focus"] }) =>
    routineTitle(item, (focus) => t(`training.focus.${focus}`));
  return (
    <Card className={firstOpen ? "border-primary" : undefined}>
      <CardHeader>
        <CardDescription>{t("home.todayWorkout")}</CardDescription>
        <CardTitle className="text-xl">
          {t("home.unitsProgress", { done: doneCount, total: training.units.length + training.unplanned.length })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {training.units.map((unit) => {
            const planTitle = training.planTitles[unit.planId];
            return (
              <li key={unit.day.id} className="flex items-center gap-3 py-2">
                <div className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 font-medium">
                    {unit.done ? <CheckCircle2Icon className="text-primary size-4 shrink-0" aria-hidden /> : null}
                    <span className="truncate">{title(unit.day)}</span>
                  </span>
                  <span className="text-muted-foreground block truncate text-sm">
                    {planTitle ? `${planTitle} · ` : ""}
                    {unit.done
                      ? t("home.unitDone", { sets: unit.done.completedSets, minutes: unit.done.durationMinutes ?? 0 })
                      : t("training.plan.estimated", { minutes: unit.day.estimatedMinutes })}
                  </span>
                </div>
                {unit.done ? (
                  <Button asChild variant="ghost" className="min-h-11">
                    <Link href={`/workout/${unit.done.id}`}>{t("home.viewWorkout")}</Link>
                  </Button>
                ) : (
                  <StartWorkoutForm planDayId={unit.day.id}>
                    <Button
                      type="submit"
                      variant={unit === firstOpen ? "default" : "outline"}
                      className="min-h-11"
                      aria-label={t("routines.startLabel", { name: title(unit.day) })}
                    >
                      <PlayIcon aria-hidden />
                      {t("training.plan.start")}
                    </Button>
                  </StartWorkoutForm>
                )}
              </li>
            );
          })}
          {training.unplanned.map((session) => (
            <li key={session.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2Icon className="text-primary size-4 shrink-0" aria-hidden />
                  <span className="truncate">{title(session)}</span>
                </span>
                <span className="text-muted-foreground block truncate text-sm">
                  {t("home.unitDone", { sets: session.completedSets, minutes: session.durationMinutes ?? 0 })}
                </span>
              </div>
              <Button asChild variant="ghost" className="min-h-11">
                <Link href={`/workout/${session.id}`}>{t("home.viewWorkout")}</Link>
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * Kachel „Heutiges Training“: laufendes Training, die Einheiten des Tages aus Haupt- und
 * Zusatzplänen oder Ruhetag. Mit nur einer Einheit sieht sie aus wie bisher.
 */
export async function TrainingWidget({ training }: { training: TrainingToday }) {
  const t = await getTranslations();
  const { running, units, unplanned, upcoming } = training;
  if (running) return <RunningCard running={running} />;
  if (units.length + unplanned.length > 1) return <UnitListCard training={training} />;
  const [unit] = units;
  if (unit) return unit.done ? <DoneCard session={unit.done} /> : <PlannedCard day={unit.day} />;
  const [spontaneous] = unplanned;
  if (spontaneous) return <DoneCard session={spontaneous} />;
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
