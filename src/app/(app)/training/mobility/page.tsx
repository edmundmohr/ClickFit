import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CalendarCheckIcon, FlameIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MOBILITY_EXERCISES_BY_ID, MOBILITY_ROUTINES, MOBILITY_ROUTINES_BY_ID } from "@/data/mobility";
import { summarizeRoutine } from "@/domain/mobility/routines";
import { MOBILITY_COMPLAINTS, MOBILITY_REGIONS } from "@/domain/mobility/types";
import { isOneOf } from "@/domain/training/types";
import { requireUser } from "@/features/auth/session";
import { RecentLogs } from "@/features/mobility/components/recent-logs";
import { RoutineBrowser } from "@/features/mobility/components/routine-browser";
import { getLastDoneByRoutine, getMobilityStreak, listLogs } from "@/features/mobility/services/mobility-service";
import { addDays, startOfWeek, toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("mobility");
  return { title: t("title") };
}

const RECENT_DAYS = 14;
const RECENT_LIMIT = 5;

export default async function MobilityPage({ searchParams }: PageProps<"/training/mobility">) {
  const user = await requireUser();
  const t = await getTranslations("mobility");
  const params = await searchParams;
  const today = toLocalDate(new Date());
  const weekStart = startOfWeek(today);
  const db = getDb();

  // Ein Zeitraum deckt beides ab: die Zahl dieser Woche und die Liste der letzten Einträge.
  const [streak, logs, lastDone] = await Promise.all([
    getMobilityStreak(db, user.id, today),
    listLogs(db, user.id, addDays(today, -(RECENT_DAYS - 1)), today),
    getLastDoneByRoutine(db, user.id),
  ]);
  const sessionsThisWeek = logs.filter((log) => log.date >= weekStart).length;
  const routines = MOBILITY_ROUTINES.map((routine) => ({
    ...summarizeRoutine(routine, MOBILITY_EXERCISES_BY_ID),
    lastDone: lastDone.get(routine.id) ?? null,
  }));
  const recent = logs.slice(0, RECENT_LIMIT).map((log) => ({
    id: log.id,
    routineName: MOBILITY_ROUTINES_BY_ID.get(log.routineId)?.name ?? null,
    date: log.date,
    durationSeconds: log.durationSeconds,
  }));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription className="flex items-center gap-1.5">
                <FlameIcon className="size-4 text-orange-500" aria-hidden />
                {t("overview.streak")}
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">{streak}</CardTitle>
              <CardDescription>{t("overview.streakUnit", { count: streak })}</CardDescription>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader className="px-4">
              <CardDescription className="flex items-center gap-1.5">
                <CalendarCheckIcon className="text-primary size-4" aria-hidden />
                {t("overview.week")}
              </CardDescription>
              <CardTitle className="text-3xl tabular-nums">{sessionsThisWeek}</CardTitle>
              <CardDescription>{t("overview.weekUnit", { count: sessionsThisWeek })}</CardDescription>
            </CardHeader>
          </Card>
        </div>
        <RoutineBrowser
          routines={routines}
          today={today}
          initialRegion={isOneOf(MOBILITY_REGIONS, params.region) ? params.region : null}
          initialComplaint={isOneOf(MOBILITY_COMPLAINTS, params.complaint) ? params.complaint : null}
        />
        <RecentLogs logs={recent} />
      </div>
    </>
  );
}
