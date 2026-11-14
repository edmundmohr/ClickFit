import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/features/auth/session";
import { getDailyTotals } from "@/features/nutrition/services/diary-service";
import { getWeights } from "@/features/nutrition/services/tracking-service";
import { getPeriodSessions, getTrainedSets } from "@/features/progress/services/progress-service";
import { getUserCatalog } from "@/features/training/services/exercise-service";
import { weightTrend } from "@/domain/nutrition/adaptive";
import { periodReport } from "@/domain/progress/reports";
import { addDays, shiftMonth, toLocalDate } from "@/lib/dates";
import { formatMonth, formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import { cn } from "@/lib/utils";
import { toDisplayWeight, weightUnitKey } from "@/lib/units";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("progress.tabs");
  return { title: t("reports") };
}

const WEIGHT_LOOKBACK_DAYS = 60;
const pad = (value: number) => String(value).padStart(2, "0");

export default async function ProgressReportsPage({ searchParams }: PageProps<"/progress/reports">) {
  const user = await requireUser();
  const t = await getTranslations();
  const today = toLocalDate(new Date());
  const params = await searchParams;
  const isYear = params.type === "year";
  const match = /^(\d{4})(?:-(\d{2}))?$/.exec(typeof params.p === "string" ? params.p : "");
  const year = match && Number(match[1]) >= 2000 && Number(match[1]) <= 2100 ? Number(match[1]) : Number(today.slice(0, 4));
  const monthParam = match?.[2] ? Number(match[2]) : Number(today.slice(5, 7));
  const month = monthParam >= 1 && monthParam <= 12 ? monthParam : 1;

  const from = isYear ? `${year}-01-01` : `${year}-${pad(month)}-01`;
  const next = isYear ? { year: year + 1, month } : shiftMonth(year, month, 1);
  const previous = isYear ? { year: year - 1, month } : shiftMonth(year, month, -1);
  const to = addDays(isYear ? `${year + 1}-01-01` : `${next.year}-${pad(next.month)}-01`, -1);
  const href = (target: { year: number; month: number }) =>
    `/progress/reports?type=${isYear ? "year" : "month"}&p=${target.year}${isYear ? "" : `-${pad(target.month)}`}`;

  const db = getDb();
  const [sessions, sets, weights, intake] = await Promise.all([
    getPeriodSessions(db, user.id, from, to),
    getTrainedSets(db, user.id, { to }),
    getWeights(db, user.id, addDays(from, -WEIGHT_LOOKBACK_DAYS), to),
    getDailyTotals(db, user.id, from, to),
  ]);
  const report = periodReport(sessions, sets, from, to);
  const trend = weightTrend(weights);
  const startTrend = trend.filter((point) => point.date <= from).at(-1) ?? trend.find((point) => point.date >= from);
  const endTrend = trend.at(-1);
  const weightChange = startTrend && endTrend && endTrend.date >= from ? endTrend.trendKg - startTrend.trendKg : null;
  const avgKcal = intake.length > 0 ? intake.reduce((total, day) => total + day.kcal, 0) / intake.length : null;

  const unit = t(`training.units.${weightUnitKey(user.unitSystem)}`);
  const display = (kg: number) => toDisplayWeight(kg, user.unitSystem);
  const catalog = await getUserCatalog(db, user.id);
  const name = (exerciseId: string) => catalog.find(exerciseId)?.name ?? exerciseId;
  const stats = [
    { label: t("progress.reports.workouts"), value: String(report.workouts) },
    { label: t("progress.reports.trainingDays"), value: String(report.trainingDays) },
    { label: t("progress.reports.duration"), value: t("progress.reports.hours", { value: formatNumber(report.totalMinutes / 60) }) },
    { label: t("progress.reports.sets"), value: formatNumber(report.sets, 0) },
    { label: t("progress.reports.volume"), value: `${formatNumber(display(report.volumeKg), 0)} ${unit}` },
    {
      label: t("progress.reports.weightChange"),
      value:
        weightChange === null
          ? t("progress.reports.noWeight")
          : `${weightChange > 0 ? "+" : ""}${formatNumber(display(Math.abs(weightChange)) * Math.sign(weightChange))} ${unit}`,
    },
  ];
  const isEmpty = report.workouts === 0 && intake.length === 0 && weightChange === null;
  const tab = "flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-medium";

  return (
    <div className="grid gap-4">
      <div className="bg-secondary flex gap-1 rounded-xl p-1">
        <Link href="/progress/reports?type=month" className={cn(tab, !isYear && "bg-background shadow-xs")}>
          {t("progress.reports.month")}
        </Link>
        <Link href="/progress/reports?type=year" className={cn(tab, isYear && "bg-background shadow-xs")}>
          {t("progress.reports.year")}
        </Link>
      </div>
      <div className="flex items-center justify-between">
        <Link href={href(previous)} aria-label={t("progress.reports.previous")} className="flex size-11 items-center justify-center rounded-md border">
          <ChevronLeftIcon className="size-5" aria-hidden />
        </Link>
        <h1 className="text-lg font-semibold">{isYear ? year : formatMonth(year, month)}</h1>
        <Link href={href(next)} aria-label={t("progress.reports.next")} className="flex size-11 items-center justify-center rounded-md border">
          <ChevronRightIcon className="size-5" aria-hidden />
        </Link>
      </div>

      {isEmpty ? (
        <p className="text-muted-foreground text-sm">{t("progress.reports.empty")}</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-2">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-card rounded-xl border px-4 py-3">
                <dt className="text-muted-foreground text-xs">{stat.label}</dt>
                <dd className="text-lg font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
          {avgKcal !== null ? (
            <Card>
              <CardContent className="text-sm">
                <p className="text-muted-foreground">{t("progress.reports.avgKcal")}</p>
                <p className="text-lg font-semibold tabular-nums">
                  {t("nutrition.macros.kcalValue", { value: formatNumber(avgKcal, 0) })}
                </p>
                <p className="text-muted-foreground">{t("progress.reports.loggedDays", { count: intake.length })}</p>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardHeader>
              <CardTitle>{t("progress.reports.improved")}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {report.improvedExercises.length === 0 ? (
                <p className="text-muted-foreground">{t("progress.reports.noImproved")}</p>
              ) : (
                <ul className="grid gap-1">
                  {report.improvedExercises.map((exerciseId) => (
                    <li key={exerciseId}>{name(exerciseId)}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          {report.topExercises.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("progress.reports.topExercises")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="divide-y text-sm">
                  {report.topExercises.map((entry) => (
                    <li key={entry.exerciseId} className="flex justify-between gap-3 py-2">
                      <span className="min-w-0 truncate font-medium">{name(entry.exerciseId)}</span>
                      <span className="text-muted-foreground shrink-0">
                        {t("progress.strength.mostUsedValue", { sets: entry.sets, sessions: entry.sessions })}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ) : null}
          {isYear && report.busiestMonth ? (
            <p className="text-muted-foreground text-sm">
              {t("progress.reports.busiestMonth")}
              {": "}
              {formatMonth(year, report.busiestMonth)}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
