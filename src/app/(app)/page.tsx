import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SlidersHorizontalIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { DayChangeRefresh } from "@/features/dashboard/day-change-refresh";
import { QuickActions } from "@/features/dashboard/quick-actions";
import { TrainingWidget } from "@/features/dashboard/training-widget";
import { RecoveryWidget, StreakWidget, WeekWidget, WeightWidget } from "@/features/dashboard/widgets";
import { NutritionWidget, WaterWidget } from "@/features/nutrition/components/today-nutrition";
import { getDashboardWidgets, type DashboardWidget } from "@/features/progress/services/dashboard-service";
import { OnboardingPrompt } from "@/features/training/components/onboarding-prompt";
import { getTrainingStats, listSessionsBetween } from "@/features/training/services/history-service";
import { getScheduledPlans } from "@/features/training/services/plan-service";
import { getTrainingSettings } from "@/features/training/services/settings-service";
import { getInProgressSession } from "@/features/training/services/workout-service";
import { folderTitle } from "@/features/training/titles";
import { nextScheduledDay, scheduledWeekdays, todayOverview } from "@/domain/training/plan-roles";
import { pauseDates } from "@/domain/training/vacation";
import type { Meal } from "@/domain/nutrition/types";
import { TIME_ZONE } from "@/i18n/config";
import { toLocalDate, weekdayOf } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

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
  const [plans, widgets, running, settings] = await Promise.all([
    getScheduledPlans(db, user.id, today),
    getDashboardWidgets(db, user.id),
    getInProgressSession(db, user.id),
    getTrainingSettings(db, user.id),
  ]);
  const plan = plans.find((item) => item.status === "active") ?? null;
  const plannedWeekdays = scheduledWeekdays(plans);
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
              // Die Liste ist neueste zuerst; die Zuordnung zu geplanten Einheiten geht chronologisch.
              ...todayOverview(plans, todayWeekday, [...todaySessions].reverse()),
              upcoming: nextScheduledDay(plans, todayWeekday),
              planTitles:
                plans.length > 1
                  ? Object.fromEntries(
                      plans.map((item) => [item.id, folderTitle(item, (split) => t(`training.splits.${split}`))]),
                    )
                  : {},
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
        <DayChangeRefresh today={today} />
        {/* Ohne Datum: Die Eingabeseite nimmt „heute“ beim Öffnen, auch nach Mitternacht. */}
        <QuickActions
          trainingHref={running ? `/workout/${running.id}` : "/training"}
          mealHref={`/nutrition/add?target=log&meal=${mealForNow(now)}`}
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
