import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeriesChart } from "@/components/charts/series-chart";
import { requireUser } from "@/features/auth/session";
import { HealthCard } from "@/features/integrations/components/health-card";
import { WeightCard } from "@/features/nutrition/components/weight-card";
import { getWeights } from "@/features/nutrition/services/tracking-service";
import { MeasurementPanel } from "@/features/progress/components/measurement-panel";
import { getMeasurements } from "@/features/progress/services/progress-service";
import { trendChangeOver, weightTrend } from "@/domain/nutrition/adaptive";
import { addDays, toLocalDate } from "@/lib/dates";
import { formatDayShort, formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import { toDisplayWeight, weightUnitKey } from "@/lib/units";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("progress");
  return { title: t("title") };
}

const CHART_DAYS = 180;
const CHANGE_DAYS = 30;
/** So weit darf die Vergleichsmessung vom Tag vor 30 Tagen (und die jüngste von heute) entfernt sein. */
const CHANGE_TOLERANCE_DAYS = 7;

export default async function ProgressBodyPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const today = toLocalDate(new Date());
  const db = getDb();
  const [weights, measurements] = await Promise.all([
    getWeights(db, user.id, addDays(today, -CHART_DAYS), today),
    getMeasurements(db, user.id),
  ]);
  const trend = weightTrend(weights);
  const latest = trend.at(-1) ?? null;
  // Ohne Messung um den Tag vor 30 Tagen bleibt die Veränderung ausgeblendet.
  const trendChange = trendChangeOver(trend, today, CHANGE_DAYS, CHANGE_TOLERANCE_DAYS);
  const unit = t(`training.units.${weightUnitKey(user.unitSystem)}`);
  const display = (kg: number) => toDisplayWeight(kg, user.unitSystem);
  const change = trendChange ? display(trendChange.to.trendKg) - display(trendChange.from.trendKg) : null;

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
                {change !== null
                  ? ` · ${t("progress.body.change", { value: `${change > 0 ? "+" : ""}${formatNumber(change)}`, unit })}`
                  : ""}
              </p>
              {trend.length > 1 ? (
                <SeriesChart
                  kind="line"
                  ariaLabel={t("progress.body.weightChartLabel")}
                  valueLabel={t("progress.body.trend")}
                  rawLabel={t("progress.body.weight")}
                  unit={unit}
                  data={trend.map((point) => ({
                    label: formatDayShort(point.date).slice(-6),
                    value: display(point.trendKg),
                    raw: display(point.weightKg),
                  }))}
                />
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">{t("progress.body.noWeights")}</p>
          )}
        </CardContent>
      </Card>
      <WeightCard
        key={`${today}-${latest?.date === today ? latest.weightKg : "none"}`}
        date={today}
        status={{ today: latest?.date === today ? latest.weightKg : null, latest }}
        unitSystem={user.unitSystem}
      />
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
