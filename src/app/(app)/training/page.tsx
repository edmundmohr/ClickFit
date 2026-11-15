import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ClipboardListIcon, CrosshairIcon, FolderOpenIcon, MapPinIcon, PlayIcon, SlidersHorizontalIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { PlanRefineDialog } from "@/features/ai/components/plan-refine-dialog";
import { getAiStatus } from "@/features/ai/services/ai-service";
import { requireUser } from "@/features/auth/session";
import { OnboardingPrompt } from "@/features/training/components/onboarding-prompt";
import { PlanDayCard } from "@/features/training/components/plan-day-card";
import { RecoveryDayCard } from "@/features/training/components/recovery-day-card";
import { RegeneratePlanButton } from "@/features/training/components/regenerate-plan-button";
import { getTrainingContext } from "@/features/training/services/context-service";
import { getScheduledPlans } from "@/features/training/services/plan-service";
import { getRecoveryDay } from "@/features/training/services/recovery-day-service";
import { folderTitle } from "@/features/training/titles";
import { cycleStatus } from "@/domain/training/cycle";
import { isVacationActive } from "@/domain/training/vacation";
import { getInProgressSession } from "@/features/training/services/workout-service";
import { isDeloadWeek } from "@/domain/training/progression";
import { diffDays, toLocalDate, weekdayOf } from "@/lib/dates";
import { formatDayShort, formatTime } from "@/lib/format";
import { getLlmProvider } from "@/lib/llm";
import { getDb, getEnv } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("training.plan");
  return { title: t("title") };
}

export default async function TrainingPage() {
  const user = await requireUser();
  const t = await getTranslations("training.plan");
  const tTraining = await getTranslations("training");
  const tAll = await getTranslations();
  const db = getDb();
  const today = toLocalDate(new Date());
  const context = await getTrainingContext(db, user.id, today);
  const [plans, running] = await Promise.all([
    getScheduledPlans(db, user.id, today, context),
    getInProgressSession(db, user.id),
  ]);
  const plan = plans.find((item) => item.status === "active") ?? null;
  const extraPlans = plans.filter((item) => item.status === "extra");

  if (!plan) {
    return (
      <OnboardingPrompt title={t("noProfileTitle")} text={t("noProfileText")} action={t("startOnboarding")} />
    );
  }

  const todayWeekday = weekdayOf(today);
  const deload = isDeloadWeek(diffDays(plan.startDate, today), plan.deloadEveryWeeks);
  const { settings, gym, profile } = context;
  const vacation = isVacationActive(settings.vacation, today) ? settings.vacation : null;
  const cycle = settings.cycle?.enabled ? cycleStatus(settings.cycle.lastStart, settings.cycle.lengthDays, today) : null;
  const recoveryDay = settings.recoveryMode && !running ? await getRecoveryDay(db, user.id) : null;
  const ai = await getAiStatus(db, getLlmProvider(getEnv()), user.id, today);
  const gymName = gym ? (gym.name ?? tTraining(`locations.${gym.type}`)) : null;
  const injuries = profile?.injuries ?? [];
  const gymLabel = gymName ? t("location", { name: gymName }) : tAll("gyms.title");
  /** Hinweis auf den festen Ort eines Plans, wenn er vom Ort des Tages abweicht. */
  const fixedLocation = (gymId: string | null) => {
    const fixed = gymId === null || gymId === gym?.id ? null : context.gyms.find((item) => item.id === gymId);
    return fixed ? (
      <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
        <MapPinIcon className="size-4 shrink-0" aria-hidden />
        {t("fixedLocation", { name: fixed.name ?? tTraining(`locations.${fixed.type}`) })}
      </p>
    ) : null;
  };

  return (
    <>
      <PageHeader
        title={t("title")}
        description={folderTitle(plan, (split) => tTraining(`splits.${split}`))}
      />
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/training/gyms">
              <MapPinIcon aria-hidden />
              {gymLabel}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/training/adjustments">
              <SlidersHorizontalIcon aria-hidden />
              {t("adjustments")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/training/plans">
              <FolderOpenIcon aria-hidden />
              {t("managePlans")}
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/training/focus">
              <CrosshairIcon aria-hidden />
              {t("focusTraining")}
            </Link>
          </Button>
        </div>
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
        {vacation ? (
          <Alert>
            <AlertTitle>
              {t(vacation.type === "pause" ? "vacationPauseTitle" : "vacationTravelTitle", {
                date: formatDayShort(vacation.until),
              })}
            </AlertTitle>
            <AlertDescription>
              {vacation.type === "pause" ? t("vacationPauseText") : t("vacationTravelText", { name: gymName ?? "" })}
            </AlertDescription>
          </Alert>
        ) : null}
        {injuries.length > 0 ? (
          <Alert>
            <AlertTitle>{t("injuryTitle")}</AlertTitle>
            <AlertDescription>
              {t("injuryText", { regions: injuries.map((region) => tAll(`onboarding.regions.${region}`)).join(", ") })}
            </AlertDescription>
          </Alert>
        ) : null}
        {cycle ? (
          <Alert>
            <AlertTitle>{t("cycleTitle", { phase: tTraining(`cyclePhases.${cycle.phase}`), day: cycle.day })}</AlertTitle>
            <AlertDescription>{tTraining(`cycleHints.${cycle.phase}`)}</AlertDescription>
          </Alert>
        ) : null}
        {deload ? (
          <Alert>
            <AlertTitle>{t("deloadTitle")}</AlertTitle>
            <AlertDescription>{t("deloadText")}</AlertDescription>
          </Alert>
        ) : null}
        {recoveryDay ? <RecoveryDayCard day={recoveryDay} canStart={!running} /> : null}
        {fixedLocation(plan.gymProfileId)}
        {plan.days.map((day) => (
          <PlanDayCard key={day.id} day={day} isToday={day.weekday === todayWeekday} canStart={!running} />
        ))}
        {extraPlans.map((extra) => (
          <section key={extra.id} className="grid gap-4 pt-2">
            <h2 className="text-lg font-semibold">
              {t("extraTitle", { name: folderTitle(extra, (split) => tTraining(`splits.${split}`)) })}
            </h2>
            {fixedLocation(extra.gymProfileId)}
            {extra.days.map((day) => (
              <PlanDayCard key={day.id} day={day} isToday={day.weekday === todayWeekday} canStart={!running} />
            ))}
          </section>
        ))}
        <div className="flex flex-wrap gap-3 pt-2">
          <RegeneratePlanButton />
          {ai.available ? <PlanRefineDialog enabled={ai.enabled} /> : null}
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
