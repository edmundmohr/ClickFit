import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { CycleCard, ExcludedCard, InjuryCard } from "@/features/training/components/adjustments/health-cards";
import { ExtraSportsCard, ModesCard, VacationCard } from "@/features/training/components/adjustments/mode-cards";
import { OnboardingPrompt } from "@/features/training/components/onboarding-prompt";
import { getTrainingContext } from "@/features/training/services/context-service";
import { getProfile } from "@/features/training/services/profile-service";
import { toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adjustments");
  return { title: t("title") };
}

export default async function AdjustmentsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const db = getDb();
  const today = toLocalDate(new Date());
  const [context, stored] = await Promise.all([getTrainingContext(db, user.id, today), getProfile(db, user.id)]);

  if (!context.profile || !stored) {
    return (
      <OnboardingPrompt
        title={t("adjustments.title")}
        text={t("adjustments.needsProfile")}
        action={t("training.plan.startOnboarding")}
      />
    );
  }

  const { settings, catalog, gyms } = context;
  const excluded = context.profile.excludedExerciseIds.flatMap((id) => {
    const exercise = catalog.find(id);
    return exercise ? [{ id, name: exercise.name }] : [];
  });

  return (
    <>
      <PageHeader title={t("adjustments.title")} description={t("adjustments.description")} />
      <div className="grid gap-4">
        <InjuryCard injuries={context.profile.injuries} note={stored.profile.injuryNote ?? ""} />
        <VacationCard
          vacation={settings.vacation}
          today={today}
          gyms={gyms.map((gym) => ({ id: gym.id, name: gym.name ?? t(`training.locations.${gym.type}`) }))}
        />
        <ModesCard
          recoveryMode={settings.recoveryMode}
          gripModule={settings.gripModule}
          exerciseCheckIn={settings.exerciseCheckIn}
        />
        <ExtraSportsCard sports={settings.extraSports} />
        <ExcludedCard exercises={excluded} />
        <CycleCard cycle={settings.cycle} today={today} />
      </div>
    </>
  );
}
