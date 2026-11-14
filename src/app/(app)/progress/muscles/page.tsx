import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/features/auth/session";
import { MusclePanel, type MuscleInfo } from "@/features/progress/components/muscle-panel";
import { getRecoveryOverrides, getTrainedSets } from "@/features/progress/services/progress-service";
import { findExercise } from "@/features/training/catalog";
import { MUSCLES, type Muscle } from "@/domain/exercises/types";
import {
  areaDistribution,
  isCountingSet,
  setsPerMuscle,
  trainingDaysPerMuscle,
  weeklySetsForMuscle,
} from "@/domain/progress/muscle-load";
import { recoveryStatus } from "@/domain/progress/recovery";
import { BODY_AREAS } from "@/domain/progress/types";
import { addDays, startOfWeek, toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("progress.tabs");
  return { title: t("muscles") };
}

const WEEKS = 8;
const FOUR_WEEKS_DAYS = 27;

export default async function ProgressMusclesPage() {
  const user = await requireUser();
  const t = await getTranslations("progress.muscles");
  const now = new Date();
  const today = toLocalDate(now);
  const db = getDb();
  const from = addDays(startOfWeek(today), -7 * (WEEKS - 1));
  const [sets, overrides] = await Promise.all([
    getTrainedSets(db, user.id, { from }),
    getRecoveryOverrides(db, user.id),
  ]);

  const recovery = recoveryStatus(sets, findExercise, now, overrides);
  const thisWeek = setsPerMuscle(sets, findExercise, startOfWeek(today), today);
  const fourWeeksFrom = addDays(today, -FOUR_WEEKS_DAYS);
  const days = trainingDaysPerMuscle(sets, findExercise, fourWeeksFrom, today);
  const lastTrained = new Map<Muscle, string>();
  for (const set of sets) {
    if (!isCountingSet(set)) continue;
    for (const muscle of findExercise(set.exerciseId)?.primary ?? []) {
      if ((lastTrained.get(muscle) ?? "") < set.date) lastTrained.set(muscle, set.date);
    }
  }

  const data = {} as Record<Muscle, MuscleInfo>;
  for (const muscle of MUSCLES) {
    const override = overrides[muscle];
    data[muscle] = {
      recovery: recovery[muscle],
      setsThisWeek: thisWeek[muscle],
      daysInFourWeeks: days[muscle],
      lastTrained: lastTrained.get(muscle) ?? null,
      weeks: weeklySetsForMuscle(sets, findExercise, muscle, today, WEEKS),
      overrideDate: override ? toLocalDate(override.setAt) : null,
    };
  }
  const areas = areaDistribution(setsPerMuscle(sets, findExercise, fourWeeksFrom, today));

  return (
    <div className="grid gap-4">
      <MusclePanel data={data} />
      <Card>
        <CardHeader>
          <CardTitle>{t("areasTitle")}</CardTitle>
          <CardDescription>{t("areasHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-3">
            {BODY_AREAS.map((area) => {
              const percent = Math.round(areas[area] * 100);
              return (
                <li key={area} className="grid gap-1">
                  <div className="flex justify-between gap-2 text-sm">
                    <span>{t(`areas.${area}`)}</span>
                    <span className="tabular-nums">{`${percent} %`}</span>
                  </div>
                  <div className="bg-secondary h-2 overflow-hidden rounded-full">
                    <div className="h-full rounded-full" style={{ width: `${percent}%`, background: "var(--viz-1)" }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
