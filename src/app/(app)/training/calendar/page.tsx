import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { SessionList } from "@/features/training/components/session-list";
import { getDailyTotals } from "@/features/nutrition/services/diary-service";
import { listSessionsBetween } from "@/features/training/services/history-service";
import { getActivePlan } from "@/features/training/services/plan-service";
import { dayStatus, type DayStatus } from "@/domain/training/calendar";
import { WEEKDAYS } from "@/domain/training/types";
import { buildCalendarMonth, shiftMonth, toLocalDate } from "@/lib/dates";
import { formatDayLong, formatMonth } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("training.calendar");
  return { title: t("title") };
}

const STATUS_CLASS: Record<DayStatus, string> = {
  done: "bg-primary text-primary-foreground font-semibold",
  planned: "border-primary border-2 border-dashed",
  missed: "bg-destructive/15 text-destructive",
  rest: "text-muted-foreground",
};
const STATUS_LABEL = { done: "dayDone", planned: "dayPlanned", missed: "dayMissed", rest: "dayRest" } as const;

function parseMonthParam(value: string | undefined, fallback: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  const [year, month] = match ? [Number(match[1]), Number(match[2])] : [0, 0];
  if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month };
  return { year: Number(fallback.slice(0, 4)), month: Number(fallback.slice(5, 7)) };
}

const monthParam = (value: { year: number; month: number }) =>
  `${value.year}-${String(value.month).padStart(2, "0")}`;

export default async function CalendarPage({ searchParams }: PageProps<"/training/calendar">) {
  const user = await requireUser();
  const t = await getTranslations("training");
  const mealLegend = (await getTranslations("nutrition"))("calendarLegend");
  const today = toLocalDate(new Date());
  const { m } = await searchParams;
  const { year, month } = parseMonthParam(typeof m === "string" ? m : undefined, today);
  const calendar = buildCalendarMonth(year, month);
  const days = calendar.weeks.flat().filter((day): day is string => day !== null);

  const db = getDb();
  const [plan, sessions, foodDays] = await Promise.all([
    getActivePlan(db, user.id),
    listSessionsBetween(db, user.id, days[0], days[days.length - 1]),
    getDailyTotals(db, user.id, days[0], days[days.length - 1]),
  ]);
  const foodLogged = new Set(foodDays.map((row) => row.date));
  const completed = new Set(sessions.map((session) => session.date));
  const schedule = plan ? { startDate: plan.startDate, weekdays: plan.days.map((day) => day.weekday) } : null;

  return (
    <>
      <PageHeader title={t("calendar.title")} />
      <div className="mb-3 flex items-center justify-between">
        <Link
          href={`/training/calendar?m=${monthParam(shiftMonth(year, month, -1))}`}
          aria-label={t("calendar.previous")}
          className="flex size-11 items-center justify-center rounded-md border"
        >
          <ChevronLeftIcon className="size-5" aria-hidden />
        </Link>
        <h2 className="text-lg font-semibold">{formatMonth(year, month)}</h2>
        <Link
          href={`/training/calendar?m=${monthParam(shiftMonth(year, month, 1))}`}
          aria-label={t("calendar.next")}
          className="flex size-11 items-center justify-center rounded-md border"
        >
          <ChevronRightIcon className="size-5" aria-hidden />
        </Link>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((weekday) => (
          <div key={weekday} className="text-muted-foreground pb-1 text-xs">
            {t(`weekdaysShort.${weekday}`)}
          </div>
        ))}
        {calendar.weeks.flat().map((day, index) => {
          if (!day) return <div key={`empty-${index}`} />;
          const status = dayStatus(day, completed, schedule, today);
          return (
            <div
              key={day}
              aria-label={t(`calendar.${STATUS_LABEL[status]}`, { date: formatDayLong(day) })}
              className={cn(
                "relative flex aspect-square items-center justify-center rounded-full text-sm tabular-nums",
                STATUS_CLASS[status],
                day === today && "ring-ring ring-2 ring-offset-2 ring-offset-transparent",
              )}
            >
              {Number(day.slice(8))}
              {foodLogged.has(day) ? (
                <span aria-hidden className="absolute bottom-1 size-1.5 rounded-full bg-emerald-500" />
              ) : null}
            </div>
          );
        })}
      </div>

      <ul className="text-muted-foreground mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3 rounded-full", STATUS_CLASS.done)} />
          {t("calendar.legendDone")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3 rounded-full", STATUS_CLASS.planned)} />
          {t("calendar.legendPlanned")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className={cn("size-3 rounded-full", STATUS_CLASS.missed)} />
          {t("calendar.legendMissed")}
        </li>
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
          {mealLegend}
        </li>
      </ul>

      <h2 className="mt-8 mb-3 text-lg font-semibold">{t("calendar.sessions")}</h2>
      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("calendar.empty")}</p>
      ) : (
        <SessionList sessions={sessions} unitSystem={user.unitSystem} />
      )}
    </>
  );
}
