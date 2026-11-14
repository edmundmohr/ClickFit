import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { QuickActions } from "@/features/dashboard/quick-actions";
import {
  RecoveryWidget,
  StreakWidget,
  TrainingWidget,
  WeekWidget,
  WeightWidget,
} from "@/features/dashboard/widgets";
import { NutritionWidget, WaterWidget } from "@/features/nutrition/components/today-nutrition";
import { getDashboardWidgets, type DashboardWidget } from "@/features/progress/services/dashboard-service";
import { OnboardingPrompt } from "@/features/training/components/onboarding-prompt";
import { getTrainingStats, listSessionsBetween } from "@/features/training/services/history-service";
import { getActivePlan, type PlanDayView } from "@/features/training/services/plan-service";
import { getTrainingSettings } from "@/features/training/services/settings-service";
import { getInProgressSession } from "@/features/training/services/workout-service";
import { plannedWeekdays as fixedWeekdays } from "@/features/training/titles";
import { pauseDates } from "@/domain/training/vacation";
import type { Meal } from "@/domain/nutrition/types";
import { TIME_ZONE } from "@/i18n/config";
import { toLocalDate, weekdayOf } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

/** Nächster Trainingstag nach heute (innerhalb der kommenden Woche). */
function nextPlanDay(days: PlanDayView[], todayWeekday: number): PlanDayView | null {
  for (let offset = 1; offset <= 7; offset++) {
    const weekday = ((todayWeekday - 1 + offset) % 7) + 1;
    const match = days.find((day) => day.weekday === weekday);
    if (match) return match;
  }
  return null;
}

/** Zur Uhrzeit passende Mahlzeit für den Schnellzugriff. */
function mealForNow(now: Date): Meal {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: TIME_ZONE }).format(now));
  if (hour < 10) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

export default async function TodayPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const db = getDb();
  const now = new Date();
  const today = toLocalDate(now);
  const todayWeekday = weekdayOf(today);
  const [plan, widgets, running, settings] = await Promise.all([
    getActivePlan(db, user.id, today),
    getDashboardWidgets(db, user.id),
    getInProgressSession(db, user.id),
    getTrainingSettings(db, user.id),
  ]);
  const plannedWeekdays = fixedWeekdays(plan?.days ?? []);
  const [stats, todaySessions] = await Promise.all([
    getTrainingStats(db, user.id, plannedWeekdays, today, pauseDates(settings.vacation)),
    listSessionsBetween(db, user.id, today, today),
  ]);

  // Kacheln rund ums Training gibt es erst mit einem Plan; bis dahin steht der Einstieg oben.
  const trainingWidgets: Partial<Record<DashboardWidget, ReactNode>> = plan
    ? {
        training: (
          <TrainingWidget
            training={{
              running,
              doneToday: todaySessions[0] ?? null,
              todayDay: plan.days.find((day) => day.weekday === todayWeekday) ?? null,
              upcoming: nextPlanDay(plan.days, todayWeekday),
            }}
          />
        ),
        streak: <StreakWidget stats={stats} />,
        week: <WeekWidget stats={stats} plannedWeekdays={plannedWeekdays} today={today} />,
        recovery: <RecoveryWidget userId={user.id} />,
      }
    : {};
  const content: Partial<Record<DashboardWidget, ReactNode>> = {
    ...trainingWidgets,
    nutrition: <NutritionWidget userId={user.id} today={today} />,
    water: <WaterWidget userId={user.id} today={today} />,
    weight: <WeightWidget userId={user.id} today={today} unitSystem={user.unitSystem} />,
  };

  return (
    <>
      <PageHeader title={t("home.greeting", { name: user.name })} />
      <div className="grid gap-4">
        <QuickActions
          today={today}
          trainingHref={running ? `/workout/${running.id}` : "/training"}
          mealHref={`/nutrition/add?target=log&date=${today}&meal=${mealForNow(now)}`}
        />
        {plan ? null : (
          <OnboardingPrompt
            title={t("home.onboardingTitle")}
            text={t("home.onboardingText")}
            action={t("home.onboardingStart")}
          />
        )}
        {widgets
          .filter((widget) => widget.visible && content[widget.id])
          .map((widget) => (
            <section key={widget.id}>{content[widget.id]}</section>
          ))}
        <Button asChild variant="ghost" className="justify-self-start">
          <Link href="/dashboard">
            <SlidersHorizontalIcon aria-hidden />
            {t("progress.dashboard.customize")}
          </Link>
        </Button>
      </div>
    </>
  );
}
