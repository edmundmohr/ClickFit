import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { getCatalog } from "@/features/training/catalog";
import { OnboardingWizard } from "@/features/training/components/onboarding/onboarding-wizard";
import type { OnboardingState } from "@/features/training/components/onboarding/state";
import { DEFAULT_EQUIPMENT, getProfile, toTrainingProfile } from "@/features/training/services/profile-service";
import {
  ACTIVITY_LEVELS,
  CARDIO_TYPES,
  SEXES,
  isOneOf,
  type CardioType,
} from "@/domain/training/types";
import { getDb } from "@/lib/server/context";
import { toDisplayWeight } from "@/lib/units";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

const DEFAULT_STATE: OnboardingState = {
  goal: "muscle_gain",
  experience: "beginner",
  weekdays: [1, 3, 5],
  sessionMinutes: 60,
  locationType: "gym",
  equipment: DEFAULT_EQUIPMENT.gym,
  cardioWanted: false,
  cardioTypes: [],
  cardioSessions: 2,
  sex: "male",
  birthYear: "",
  heightCm: "",
  weight: "",
  activityLevel: "light",
  injuries: [],
  injuryNote: "",
  excludedExerciseIds: [],
};

export default async function OnboardingPage() {
  const user = await requireUser();
  const t = await getTranslations("onboarding");
  const stored = await getProfile(getDb(), user.id);

  let initialState = DEFAULT_STATE;
  if (stored) {
    const training = toTrainingProfile(stored);
    const { profile } = stored;
    initialState = {
      goal: training.goal,
      experience: training.experience,
      weekdays: training.weekdays,
      sessionMinutes: training.sessionMinutes,
      locationType: stored.locationType,
      equipment: stored.equipment,
      cardioWanted: profile.cardio.wanted,
      cardioTypes: profile.cardio.types.filter((type): type is CardioType => isOneOf(CARDIO_TYPES, type)),
      cardioSessions: profile.cardio.sessionsPerWeek || DEFAULT_STATE.cardioSessions,
      sex: isOneOf(SEXES, profile.sex) ? profile.sex : "male",
      birthYear: String(profile.birthYear),
      heightCm: String(profile.heightCm),
      weight: String(toDisplayWeight(profile.weightKg, user.unitSystem)),
      activityLevel: isOneOf(ACTIVITY_LEVELS, profile.activityLevel) ? profile.activityLevel : "light",
      injuries: training.injuries,
      injuryNote: profile.injuryNote ?? "",
      excludedExerciseIds: training.excludedExerciseIds,
    };
  }

  const exercises = getCatalog()
    .filter((exercise) => exercise.pattern !== "cardio")
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <>
      <PageHeader title={t("title")} />
      <OnboardingWizard
        initialState={initialState}
        unitSystem={user.unitSystem}
        exercises={exercises}
        defaultEquipment={DEFAULT_EQUIPMENT}
      />
    </>
  );
}
