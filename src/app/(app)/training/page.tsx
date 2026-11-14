import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ClipboardListIcon, PlayIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { OnboardingPrompt } from "@/features/training/components/onboarding-prompt";
import { PlanDayCard } from "@/features/training/components/plan-day-card";
import { RegeneratePlanButton } from "@/features/training/components/regenerate-plan-button";
import { getActivePlan } from "@/features/training/services/plan-service";
import { getInProgressSession } from "@/features/training/services/workout-service";
import { isDeloadWeek } from "@/domain/training/progression";
import { diffDays, toLocalDate, weekdayOf } from "@/lib/dates";
import { formatTime } from "@/lib/format";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("training.plan");
  return { title: t("title") };
}

export default async function TrainingPage() {
  const user = await requireUser();
  const t = await getTranslations("training.plan");
  const tTraining = await getTranslations("training");
  const db = getDb();
  const [plan, running] = await Promise.all([getActivePlan(db, user.id), getInProgressSession(db, user.id)]);

  if (!plan) {
    return (
      <OnboardingPrompt title={t("noProfileTitle")} text={t("noProfileText")} action={t("startOnboarding")} />
    );
  }

  const today = toLocalDate(new Date());
  const todayWeekday = weekdayOf(today);
  const deload = isDeloadWeek(diffDays(plan.startDate, today), plan.deloadEveryWeeks);

  return (
    <>
      <PageHeader title={t("title")} description={t("split", { split: tTraining(`splits.${plan.split}`) })} />
      <div className="grid gap-4">
        {running ? (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle>{t("runningTitle")}</CardTitle>
              <CardDescription>{t("runningText", { time: formatTime(running.startedAt) })}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild size="lg" className="w-full">
                <Link href={`/workout/${running.id}`}>
                  <PlayIcon aria-hidden />
                  {t("continue")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {deload ? (
          <Alert>
            <AlertTitle>{t("deloadTitle")}</AlertTitle>
            <AlertDescription>{t("deloadText")}</AlertDescription>
          </Alert>
        ) : null}
        {plan.days.map((day) => (
          <PlanDayCard key={day.id} day={day} isToday={day.weekday === todayWeekday} canStart={!running} />
        ))}
        <div className="flex flex-wrap gap-3 pt-2">
          <RegeneratePlanButton />
          <Button asChild variant="outline">
            <Link href="/onboarding">
              <ClipboardListIcon aria-hidden />
              {t("editProfile")}
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}
