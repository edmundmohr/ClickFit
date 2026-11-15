import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeriesChart } from "@/components/charts/series-chart";
import { requireUser } from "@/features/auth/session";
import { HealthCard } from "@/features/integrations/components/health-card";
import { getWeightEntries } from "@/features/nutrition/services/tracking-service";
import { MeasurementPanel } from "@/features/progress/components/measurement-panel";
import { WeightLogPanel } from "@/features/progress/components/weight-log-panel";
import { getMeasurements } from "@/features/progress/services/progress-service";
import { trendChangeOver, weightTrend } from "@/domain/nutrition/adaptive";
import {
  WEIGHT_RANGES,
  needsYearLabels,
  parseWeightRange,
  pointsInRange,
  trendChangeInRange,
  weightRangeStart,
} from "@/domain/progress/weight-history";
import { toLocalDate } from "@/lib/dates";
import { formatDayNumeric, formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import { toDisplayWeight, weightUnitKey } from "@/lib/units";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("progress");
  return { title: t("title") };
}

const CHANGE_DAYS = 30;
/** So weit darf die Vergleichsmessung vom Tag vor 30 Tagen (und die jüngste von heute) entfernt sein. */
const CHANGE_TOLERANCE_DAYS = 7;

export default async function ProgressBodyPage({ searchParams }: PageProps<"/progress">) {
  const user = await requireUser();
  const t = await getTranslations();
  const today = toLocalDate(new Date());
  const range = parseWeightRange((await searchParams).range);
  const from = weightRangeStart(range, today);
  const db = getDb();
  const [entries, measurements] = await Promise.all([
    getWeightEntries(db, user.id, null, today),
    getMeasurements(db, user.id),
  ]);
  // Der Trend läuft über alle Messungen; der Zeitraum schneidet nur die Anzeige zu.
  const trend = weightTrend(entries);
  const latest = trend.at(-1) ?? null;
  const visibleTrend = pointsInRange(trend, from);
  // Ohne Messung um den Tag vor 30 Tagen bleibt die Veränderung ausgeblendet.
  const trendChange = trendChangeOver(trend, today, CHANGE_DAYS, CHANGE_TOLERANCE_DAYS);
  const unit = t(`training.units.${weightUnitKey(user.unitSystem)}`);
  const display = (kg: number) => toDisplayWeight(kg, user.unitSystem);
  const signed = (value: number) => `${value > 0 ? "+" : ""}${formatNumber(value)}`;
  const change = trendChange ? display(trendChange.to.trendKg) - display(trendChange.from.trendKg) : null;
  // Wie bei der 30-Tage-Veränderung: Differenz der angezeigten (gerundeten) Werte.
  const rangeChange = trendChangeInRange(visibleTrend.map((point) => ({ ...point, trendKg: display(point.trendKg) })));
  const withYear = needsYearLabels(range, visibleTrend);
  const tab = "flex min-h-11 flex-1 items-center justify-center rounded-lg text-sm font-medium";

  return (
    <div className="grid gap-4">
      <Card id="weight" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>{t("progress.body.weightTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {latest ? (
            <>
              <p className="text-sm">
                {t("progress.body.current", { value: formatNumber(display(latest.trendKg)), unit })}
                {change !== null ? ` · ${t("progress.body.change", { value: signed(change), unit })}` : ""}
              </p>
              <nav aria-label={t("progress.body.rangeLabel")} className="bg-secondary flex gap-1 rounded-xl p-1">
                {WEIGHT_RANGES.map((item) => (
                  <Link
                    key={item}
                    href={`/progress?range=${item}`}
                    scroll={false}
                    replace
                    aria-label={t(`progress.body.rangesLong.${item}`)}
                    aria-current={item === range ? "page" : undefined}
                    className={cn(tab, item === range ? "bg-background shadow-xs" : "text-muted-foreground")}
                  >
                    {t(`progress.body.ranges.${item}`)}
                  </Link>
                ))}
              </nav>
              {visibleTrend.length > 1 ? (
                <>
                  <SeriesChart
                    kind="line"
                    ariaLabel={t("progress.body.weightChartLabel")}
                    valueLabel={t("progress.body.trend")}
                    rawLabel={t("progress.body.weight")}
                    unit={unit}
                    data={visibleTrend.map((point) => ({
                      label: formatDayNumeric(point.date, withYear),
                      value: display(point.trendKg),
                      raw: display(point.weightKg),
                    }))}
                  />
                  {rangeChange !== null ? (
                    <p className="text-muted-foreground text-sm">
                      {t("progress.body.rangeChange", {
                        value: signed(rangeChange),
                        unit,
                        count: visibleTrend.length,
                      })}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="text-muted-foreground text-sm">{t("progress.body.fewInRange")}</p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t("progress.body.noWeights")}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("progress.weightLog.title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <WeightLogPanel
            today={today}
            entries={pointsInRange(entries, from).reverse()}
            unitSystem={user.unitSystem}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("progress.body.measurementsTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <MeasurementPanel today={today} measurements={measurements} />
        </CardContent>
      </Card>
      <HealthCard userId={user.id} today={today} />
    </div>
  );
}
