"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SeriesChart } from "@/components/charts/series-chart";
import { MEASUREMENT_SITES, type MeasurementSite } from "@/domain/progress/types";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { LocalDate } from "@/lib/dates";
import { formatDayShort, formatNumber } from "@/lib/format";
import { parseDecimal } from "@/lib/units";
import { deleteMeasurementAction, saveMeasurementAction } from "../actions";
import type { MeasurementPoint } from "../services/progress-service";

interface MeasurementPanelProps {
  today: LocalDate;
  measurements: Record<MeasurementSite, MeasurementPoint[]>;
}

/** Körperumfänge eintragen und den Verlauf je Körperstelle ansehen. */
export function MeasurementPanel({ today, measurements }: MeasurementPanelProps) {
  const t = useTranslations("progress");
  const { run, pending } = useActionRunner();
  const [site, setSite] = useState<MeasurementSite>("waist");
  const [value, setValue] = useState("");
  const points = measurements[site];
  const latest = points.at(-1);
  const parsed = parseDecimal(value);

  function save() {
    if (parsed === null) return;
    run(
      () => saveMeasurementAction({ date: today, site, valueCm: parsed }),
      () => {
        toast.success(t("body.saved"));
        setValue("");
      },
    );
  }

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground text-sm">{t("body.measurementsHint")}</p>
      <form
        className="grid grid-cols-[1fr_6.5rem_auto] items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <select
          aria-label={t("body.site")}
          value={site}
          onChange={(event) => setSite(MEASUREMENT_SITES.find((item) => item === event.target.value) ?? "waist")}
          className="border-input bg-background h-11 min-w-0 rounded-md border px-3 text-base"
        >
          {MEASUREMENT_SITES.map((item) => (
            <option key={item} value={item}>
              {t(`sites.${item}`)}
              {measurements[item].length > 0 ? ` (${formatNumber(measurements[item].at(-1)?.valueCm ?? 0)})` : ""}
            </option>
          ))}
        </select>
        <Input
          inputMode="decimal"
          aria-label={t("body.value")}
          placeholder={t("body.value")}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button type="submit" disabled={pending || parsed === null}>
          {t("body.save")}
        </Button>
      </form>

      {latest ? (
        <>
          <div className="flex items-center justify-between gap-2 text-sm">
            <p>
              {t("body.last", { value: formatNumber(latest.valueCm), date: formatDayShort(latest.date) })}
              {points.length > 1
                ? ` · ${t("body.diff", {
                    value: `${latest.valueCm - points[0].valueCm > 0 ? "+" : ""}${formatNumber(latest.valueCm - points[0].valueCm)}`,
                  })}`
                : ""}
            </p>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("body.delete", { date: formatDayShort(latest.date) })}
              disabled={pending}
              onClick={() => run(() => deleteMeasurementAction(site, latest.date), () => toast.success(t("body.deleted")))}
            >
              <Trash2Icon aria-hidden />
            </Button>
          </div>
          {points.length > 1 ? (
            <SeriesChart
              kind="line"
              height={180}
              ariaLabel={t("body.chartLabel", { site: t(`sites.${site}`) })}
              valueLabel={t(`sites.${site}`)}
              unit="cm"
              data={points.map((point) => ({ label: formatDayShort(point.date).slice(-6), value: point.valueCm }))}
            />
          ) : null}
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("body.noMeasurements")}</p>
      )}
    </div>
  );
}
