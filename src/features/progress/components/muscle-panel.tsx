"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/forms/choice";
import { SeriesChart } from "@/components/charts/series-chart";
import { MUSCLES, type Muscle } from "@/domain/exercises/types";
import type { WeekLoad } from "@/domain/progress/muscle-load";
import { recoveryLevel, type RecoveryLevel } from "@/domain/progress/recovery";
import { useActionRunner } from "@/hooks/use-action-runner";
import { formatDayLong, formatDayShort, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setRecoveryOverrideAction } from "../actions";
import { MuscleMap } from "./muscle-map";

export interface MuscleInfo {
  recovery: number;
  setsThisWeek: number;
  daysInFourWeeks: number;
  lastTrained: string | null;
  weeks: WeekLoad[];
  /** Datum, an dem der Erholungswert von Hand gesetzt wurde. */
  overrideDate: string | null;
}

const MODES = ["recovery", "sets", "frequency"] as const;
type Mode = (typeof MODES)[number];

const LEVEL_COLOR: Record<RecoveryLevel, string> = {
  fresh: "var(--status-good)",
  recovering: "var(--status-warning)",
  fatigued: "var(--status-critical)",
};
const OVERRIDE_STEP = 5;
const MAP_VIEWS = ["front", "back"] as const;
/** Reihenfolge der Legende: von ermüdet nach erholt. */
const LEGEND_LEVELS: RecoveryLevel[] = ["fatigued", "recovering", "fresh"];

/** Je höher der Wert, desto kräftiger die Farbe; ohne Wert bleibt die Fläche neutral. */
function sequentialFill(value: number, max: number): string {
  if (value <= 0 || max <= 0) return "var(--muted)";
  const share = Math.round(25 + 75 * Math.min(value / max, 1));
  return `color-mix(in oklab, var(--viz-1) ${share}%, var(--muted))`;
}

export function MusclePanel({ data }: { data: Record<Muscle, MuscleInfo> }) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const [mode, setMode] = useState<Mode>("recovery");
  const [selected, setSelected] = useState<Muscle | null>(null);
  const [override, setOverride] = useState(100);

  const valueOf = (muscle: Muscle): number =>
    mode === "recovery" ? data[muscle].recovery : mode === "sets" ? data[muscle].setsThisWeek : data[muscle].daysInFourWeeks;
  const max = Math.max(...MUSCLES.map(valueOf));
  const valueText = (muscle: Muscle): string =>
    mode === "recovery"
      ? t("progress.muscles.recoveryValue", { value: data[muscle].recovery })
      : mode === "sets"
        ? t("progress.muscles.setsValue", { value: formatNumber(data[muscle].setsThisWeek) })
        : t("progress.muscles.frequencyValue", { value: data[muscle].daysInFourWeeks });

  const fills = {} as Record<Muscle, string>;
  const labels = {} as Record<Muscle, string>;
  for (const muscle of MUSCLES) {
    fills[muscle] =
      mode === "recovery" ? LEVEL_COLOR[recoveryLevel(data[muscle].recovery)] : sequentialFill(valueOf(muscle), max);
    labels[muscle] = t("progress.muscles.muscleLabel", { muscle: t(`muscles.${muscle}`), value: valueText(muscle) });
  }

  function select(muscle: Muscle) {
    setSelected(muscle);
    setOverride(Math.round(data[muscle].recovery / OVERRIDE_STEP) * OVERRIDE_STEP);
  }

  const info = selected ? data[selected] : null;
  const sorted = [...MUSCLES].sort((a, b) => (mode === "recovery" ? valueOf(a) - valueOf(b) : valueOf(b) - valueOf(a)));

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <div role="radiogroup" aria-label={t("progress.muscles.modeLabel")} className="flex flex-wrap gap-2">
            {MODES.map((item) => (
              <Chip key={item} role="radio" selected={mode === item} onToggle={() => setMode(item)}>
                {t(`progress.muscles.modes.${item}`)}
              </Chip>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            {MAP_VIEWS.map((view) => (
              <div key={view} className="grid gap-1">
                <MuscleMap
                  view={view}
                  label={t("progress.muscles.mapLabel", { view: t(`progress.muscles.${view}`) })}
                  fills={fills}
                  labels={labels}
                  selected={selected}
                  onSelect={select}
                />
                <p className="text-muted-foreground text-center text-xs">{t(`progress.muscles.${view}`)}</p>
              </div>
            ))}
          </div>
          {mode === "recovery" ? (
            <ul className="text-muted-foreground flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs">
              {LEGEND_LEVELS.map((level) => (
                <li key={level} className="flex items-center gap-1.5">
                  <span aria-hidden className="size-3 rounded-full" style={{ background: LEVEL_COLOR[level] }} />
                  {t(`progress.muscles.levels.${level}`)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-center text-xs">
              {t(mode === "sets" ? "progress.muscles.legendSets" : "progress.muscles.legendFrequency")}
            </p>
          )}
          {selected ? null : <p className="text-muted-foreground text-center text-sm">{t("progress.muscles.select")}</p>}
        </CardContent>
      </Card>

      {selected && info ? (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle>{t(`muscles.${selected}`)}</CardTitle>
            <CardDescription>
              {t("progress.muscles.recoveryValue", { value: info.recovery })}
              {" · "}
              {t(`progress.muscles.levels.${recoveryLevel(info.recovery)}`)}
              {" · "}
              {info.lastTrained
                ? t("progress.muscles.lastTrained", { date: formatDayLong(info.lastTrained) })
                : t("progress.muscles.neverTrained")}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">{t("progress.muscles.weeklyTitle")}</h3>
              <SeriesChart
                kind="bar"
                height={160}
                ariaLabel={t("progress.muscles.weeklyChartLabel", { muscle: t(`muscles.${selected}`) })}
                valueLabel={t("progress.muscles.modes.sets")}
                unit=""
                data={info.weeks.map((week) => ({ label: formatDayShort(week.weekStart).slice(-6), value: week.sets }))}
              />
            </div>
            <div className="grid gap-2">
              <h3 className="text-sm font-medium">{t("progress.muscles.overrideTitle")}</h3>
              <p className="text-muted-foreground text-sm">{t("progress.muscles.overrideHint")}</p>
              {info.overrideDate ? (
                <p className="text-muted-foreground text-sm">
                  {t("progress.muscles.overrideActive", { date: formatDayLong(info.overrideDate) })}
                </p>
              ) : null}
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={OVERRIDE_STEP}
                  value={override}
                  aria-label={t("progress.muscles.overrideTitle")}
                  onChange={(event) => setOverride(Number(event.target.value))}
                  className="accent-primary h-11 min-w-0 flex-1"
                />
                <span className="w-12 text-right text-sm font-medium tabular-nums">{`${override} %`}</span>
              </div>
              <Button
                variant="outline"
                className="justify-self-start"
                disabled={pending}
                onClick={() =>
                  run(
                    () => setRecoveryOverrideAction(selected, override),
                    () => toast.success(t("progress.muscles.overrideSaved")),
                  )
                }
              >
                {t("progress.muscles.overrideSave")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("progress.muscles.allTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-1">
            {sorted.map((muscle) => (
              <li key={muscle}>
                <button
                  type="button"
                  aria-pressed={selected === muscle}
                  onClick={() => select(muscle)}
                  className={cn(
                    "hover:bg-accent/60 flex min-h-11 w-full items-center gap-3 rounded-md px-2 text-left text-sm",
                    selected === muscle && "bg-accent",
                  )}
                >
                  <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: fills[muscle] }} />
                  <span className="min-w-0 flex-1 truncate">{t(`muscles.${muscle}`)}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">{valueText(muscle)}</span>
                </button>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
