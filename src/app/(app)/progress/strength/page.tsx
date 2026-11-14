import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { TrendingDownIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SeriesChart } from "@/components/charts/series-chart";
import { requireUser } from "@/features/auth/session";
import { getWeights } from "@/features/nutrition/services/tracking-service";
import { ExerciseSelect } from "@/features/progress/components/exercise-select";
import { getTrainedSets } from "@/features/progress/services/progress-service";
import { findExercise } from "@/features/training/catalog";
import { getProfile } from "@/features/training/services/profile-service";
import { mostUsedExercises } from "@/domain/progress/muscle-load";
import { LIFT_EXERCISE_IDS, STRENGTH_LIFTS, detectPlateau, exerciseSeries, rateStrength } from "@/domain/progress/strength";
import { bestsOf } from "@/domain/training/records";
import { SEXES, isOneOf } from "@/domain/training/types";
import { addDays, toLocalDate } from "@/lib/dates";
import { formatDayShort, formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import { toDisplayWeight, weightUnitKey } from "@/lib/units";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("progress.tabs");
  return { title: t("strength") };
}

const MOST_USED_LIMIT = 50;
const TOP_LIST = 5;
const WEIGHT_LOOKBACK_DAYS = 120;

export default async function ProgressStrengthPage({ searchParams }: PageProps<"/progress/strength">) {
  const user = await requireUser();
  const t = await getTranslations();
  const today = toLocalDate(new Date());
  const db = getDb();
  const [sets, stored, weights] = await Promise.all([
    getTrainedSets(db, user.id),
    getProfile(db, user.id),
    getWeights(db, user.id, addDays(today, -WEIGHT_LOOKBACK_DAYS), today),
  ]);
  const usage = mostUsedExercises(sets, MOST_USED_LIMIT).flatMap((entry) => {
    const exercise = findExercise(entry.exerciseId);
    return exercise ? [{ ...entry, name: exercise.name }] : [];
  });
  if (usage.length === 0) return <p className="text-muted-foreground text-sm">{t("progress.strength.noHistory")}</p>;

  const params = await searchParams;
  const requested = typeof params.exercise === "string" ? params.exercise : "";
  const selected = usage.find((entry) => entry.exerciseId === requested) ?? usage[0];
  const series = exerciseSeries(sets, selected.exerciseId);
  const hasWeight = series.some((point) => point.oneRepMaxKg !== null);
  const bests = bestsOf(
    sets
      .filter((set) => set.exerciseId === selected.exerciseId)
      .map((set) => ({ type: set.type, weightKg: set.weightKg, reps: set.reps, completed: true })),
  );
  const plateau = detectPlateau(series);

  const unit = t(`training.units.${weightUnitKey(user.unitSystem)}`);
  const display = (kg: number) => toDisplayWeight(kg, user.unitSystem);
  const label = (date: string) => formatDayShort(date).slice(-6);
  const weightValue = (kg: number | null) =>
    kg === null ? "–" : t("progress.strength.recordValue", { value: formatNumber(display(kg)), unit });
  const records = [
    { key: "weight", value: weightValue(bests.maxWeightKg), show: bests.maxWeightKg !== null },
    { key: "oneRepMax", value: weightValue(bests.maxOneRepMaxKg), show: bests.maxOneRepMaxKg !== null },
    { key: "setVolume", value: weightValue(bests.maxSetVolumeKg), show: bests.maxSetVolumeKg !== null },
    { key: "reps", value: t("progress.strength.recordReps", { value: bests.maxReps ?? 0 }), show: bests.maxReps !== null },
  ] as const;

  const bodyWeightKg = weights.at(-1)?.weightKg ?? stored?.profile.weightKg ?? null;
  const sex = isOneOf(SEXES, stored?.profile.sex) ? stored.profile.sex : "male";

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <ExerciseSelect
            label={t("progress.strength.exercise")}
            selected={selected.exerciseId}
            options={usage.map((entry) => ({ id: entry.exerciseId, name: entry.name }))}
          />
          <CardDescription>{t("progress.strength.sessions", { count: series.length })}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          {hasWeight ? (
            <>
              <div className="grid gap-2">
                <h2 className="text-sm font-medium">{`${t("progress.strength.oneRepMax")} (${unit})`}</h2>
                <SeriesChart
                  kind="line"
                  ariaLabel={t("progress.strength.chartLabel", { name: selected.name })}
                  valueLabel={t("progress.strength.oneRepMax")}
                  unit={unit}
                  data={series.map((point) => ({
                    label: label(point.date),
                    value: point.oneRepMaxKg === null ? null : display(point.oneRepMaxKg),
                  }))}
                />
              </div>
              <div className="grid gap-2">
                <h2 className="text-sm font-medium">{`${t("progress.strength.volume")} (${unit})`}</h2>
                <SeriesChart
                  kind="bar"
                  height={160}
                  ariaLabel={`${t("progress.strength.volume")} ${selected.name}`}
                  valueLabel={t("progress.strength.volume")}
                  unit={unit}
                  data={series.map((point) => ({ label: label(point.date), value: Math.round(display(point.volumeKg)) }))}
                />
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <h2 className="text-sm font-medium">{t("progress.strength.bestReps")}</h2>
              <SeriesChart
                kind="line"
                ariaLabel={t("progress.strength.chartLabel", { name: selected.name })}
                valueLabel={t("progress.strength.bestReps")}
                unit=""
                data={series.map((point) => ({ label: label(point.date), value: point.bestReps }))}
              />
            </div>
          )}
          {plateau ? (
            <Alert>
              <TrendingDownIcon aria-hidden />
              <AlertTitle>{t("progress.strength.plateauTitle")}</AlertTitle>
              <AlertDescription>
                {t("progress.strength.plateauText", { days: plateau.days })}{" "}
                {t(`progress.strength.suggestions.${plateau.suggestion}`)}
              </AlertDescription>
            </Alert>
          ) : null}
          <div>
            <h2 className="mb-2 text-sm font-medium">{t("progress.strength.recordsTitle")}</h2>
            <dl className="grid grid-cols-2 gap-2">
              {records
                .filter((record) => record.show)
                .map((record) => (
                  <div key={record.key} className="bg-secondary rounded-lg px-3 py-2">
                    <dt className="text-muted-foreground text-xs">{t(`progress.strength.records.${record.key}`)}</dt>
                    <dd className="font-semibold tabular-nums">{record.value}</dd>
                  </div>
                ))}
            </dl>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("progress.strength.levelsTitle")}</CardTitle>
          <CardDescription>
            {bodyWeightKg === null ? t("progress.strength.needsWeight") : t("progress.strength.levelsHint")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {STRENGTH_LIFTS.map((lift) => {
              const best = Math.max(
                0,
                ...LIFT_EXERCISE_IDS[lift].flatMap((id) => exerciseSeries(sets, id).map((point) => point.oneRepMaxKg ?? 0)),
              );
              const rating = best > 0 && bodyWeightKg ? rateStrength(lift, best, bodyWeightKg, sex) : null;
              return (
                <li key={lift} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-medium">{t(`progress.strength.lifts.${lift}`)}</p>
                    <p className="text-muted-foreground text-sm">
                      {rating
                        ? [
                            weightValue(best),
                            t("progress.strength.ratio", { value: formatNumber(rating.ratio, 2) }),
                            rating.nextRatio === null
                              ? null
                              : t("progress.strength.next", { value: formatNumber(rating.nextRatio, 2) }),
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : t("progress.strength.noLift")}
                    </p>
                  </div>
                  {rating ? <Badge variant="secondary">{t(`progress.strength.levels.${rating.level}`)}</Badge> : null}
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("progress.strength.mostUsedTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="divide-y">
            {usage.slice(0, TOP_LIST).map((entry) => (
              <li key={entry.exerciseId} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate font-medium">{entry.name}</span>
                <span className="text-muted-foreground shrink-0">
                  {t("progress.strength.mostUsedValue", { sets: entry.sets, sessions: entry.sessions })}
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
