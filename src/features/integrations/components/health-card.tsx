import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { FootprintsIcon } from "lucide-react";
import { SeriesChart } from "@/components/charts/series-chart";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { averageBetween, dailySeries, latestValue, type DailyValue } from "@/domain/health-import/summary";
import { addDays, type LocalDate } from "@/lib/dates";
import { formatDayShort, formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import { getHealthMetrics } from "../services/import-service";

const CHART_DAYS = 30;
const AVERAGE_DAYS = 7;

function chartData(values: DailyValue[], today: LocalDate) {
  return dailySeries(values, today, CHART_DAYS).map((point) => ({ label: formatDayShort(point.date).slice(-6), value: point.value }));
}

/** Importierte Schritte und Ruhepuls der letzten 30 Tage; ohne Daten ein Hinweis auf die Integrationen. */
export async function HealthCard({ userId, today }: { userId: string; today: LocalDate }) {
  const t = await getTranslations("integrations.health");
  const db = getDb();
  const from = addDays(today, -(CHART_DAYS - 1));
  const [steps, resting] = await Promise.all([
    getHealthMetrics(db, userId, "steps", from, today),
    getHealthMetrics(db, userId, "resting_heart_rate", from, today),
  ]);
  const average = averageBetween(steps, addDays(today, -(AVERAGE_DAYS - 1)), today);
  const latest = latestValue(resting, today);

  return (
    <Card id="health" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FootprintsIcon className="text-muted-foreground size-5" aria-hidden />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5">
        {steps.length === 0 && resting.length === 0 ? (
          <>
            <p className="text-muted-foreground text-sm">{t("empty")}</p>
            <Button asChild variant="outline" className="justify-self-start">
              <Link href="/integrations">{t("toIntegrations")}</Link>
            </Button>
          </>
        ) : (
          <>
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">{t("stepsTitle")}</h3>
              <p className="text-sm">
                {average === null ? t("stepsNoRecent") : t("stepsAverage", { value: formatNumber(average, 0) })}
              </p>
              {steps.length > 0 ? (
                <SeriesChart
                  kind="bar"
                  ariaLabel={t("stepsChartLabel")}
                  valueLabel={t("stepsLabel")}
                  unit={t("stepsUnit")}
                  height={180}
                  axisWidth={52}
                  data={chartData(steps, today)}
                />
              ) : null}
            </section>
            <section className="grid gap-3">
              <h3 className="text-sm font-medium">{t("restingTitle")}</h3>
              <p className="text-sm">
                {latest === null
                  ? t("restingNone")
                  : t("restingLatest", { value: formatNumber(latest.value, 0), date: formatDayShort(latest.date) })}
              </p>
              {resting.length > 1 ? (
                <SeriesChart
                  kind="line"
                  ariaLabel={t("restingChartLabel")}
                  valueLabel={t("restingLabel")}
                  unit={t("restingUnit")}
                  height={180}
                  data={chartData(resting, today)}
                />
              ) : null}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}
