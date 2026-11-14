import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ActivityIcon, CheckIcon, FlameIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MUSCLES } from "@/domain/exercises/types";
import { recoveryLevel } from "@/domain/progress/recovery";
import { WEEKDAYS, type Weekday } from "@/domain/training/types";
import { WeightCard } from "@/features/nutrition/components/weight-card";
import { getWeightStatus } from "@/features/nutrition/services/tracking-service";
import { getRecoverySnapshot } from "@/features/progress/services/recovery-service";
import { getUserCatalog } from "@/features/training/services/exercise-service";
import type { TrainingStats } from "@/features/training/services/history-service";
import { addDays, startOfWeek, type LocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";
import type { UnitSystem } from "@/lib/units";
import { cn } from "@/lib/utils";

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
