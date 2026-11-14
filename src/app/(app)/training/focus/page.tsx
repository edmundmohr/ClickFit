import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { FocusDayCard } from "@/features/training/components/focus-day-card";
import { FocusPicker } from "@/features/training/components/focus-picker";
import { OnboardingPrompt } from "@/features/training/components/onboarding-prompt";
import { getFocusDay } from "@/features/training/services/focus-day-service";
import { getInProgressSession } from "@/features/training/services/workout-service";
import { parseFocusAreas, parseFocusMinutes } from "@/domain/training/focus-day";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("training.focusTraining");
  return { title: t("title") };
}

export default async function FocusTrainingPage({ searchParams }: PageProps<"/training/focus">) {
  const user = await requireUser();
  const t = await getTranslations();
  const params = await searchParams;
  const db = getDb();
  const [day, running] = await Promise.all([
    getFocusDay(db, user.id, parseFocusAreas(params.areas), parseFocusMinutes(params.minutes)),
    getInProgressSession(db, user.id),
  ]);

  if (!day) {
    return (
      <OnboardingPrompt
        title={t("training.focusTraining.title")}
        text={t("training.focusTraining.needsProfile")}
        action={t("training.plan.startOnboarding")}
      />
    );
  }

  return (
    <>
      <PageHeader title={t("training.focusTraining.title")} description={t("training.focusTraining.description")} />
      <FocusPicker areas={day.areas} minutes={day.minutes} readiness={day.readiness}>
        <FocusDayCard day={day} canStart={!running} />
      </FocusPicker>
    </>
  );
}
