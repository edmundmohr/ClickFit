import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/features/auth/session";
import { getUserCatalog } from "@/features/training/services/exercise-service";
import { OnboardingWizard } from "@/features/training/components/onboarding/onboarding-wizard";
import {
  HEIGHT_RANGE_CM,
  MAX_AGE_YEARS,
  MIN_AGE_YEARS,
  WEIGHT_RANGE,
  clamp,
  type OnboardingState,
} from "@/features/training/components/onboarding/state";
import { DEFAULT_EQUIPMENT, getProfile, toTrainingProfile } from "@/features/training/services/profile-service";
import {
  MAX_TRAINING_MONTHS,
  SELF_ASSESSMENTS,
  WORK_POSTURES,
  assessmentFromExperience,
  type WorkPosture,
} from "@/domain/training/onboarding";
import {
  ACTIVITY_LEVELS,
  CARDIO_TYPES,
  SEXES,
  isOneOf,
  type CardioType,
} from "@/domain/training/types";
import { toLocalDate } from "@/lib/dates";
import { getDb, getEnv } from "@/lib/server/context";
import { toDisplayWeight, type UnitSystem } from "@/lib/units";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("title") };
}

const DEFAULT_AGE_YEARS = 30;
const DEFAULT_HEIGHT_CM = 175;
const DEFAULT_WEIGHT: Record<UnitSystem, number> = { metric: 75, imperial: 165 };

function defaultState(unitSystem: UnitSystem, currentYear: number): OnboardingState {
  return {
    sex: "male",
    birthYear: currentYear - DEFAULT_AGE_YEARS,
    heightCm: DEFAULT_HEIGHT_CM,
    weight: DEFAULT_WEIGHT[unitSystem],
    bodyFatPercent: null,
    trainingMonths: 0,
    trainedRecently: false,
    selfAssessment: "newcomer",
    goal: "muscle_gain",
    focusMuscles: [],
    weekdays: [1, 3, 5],
    sessionMinutes: 60,
    locationType: "gym",
    equipment: DEFAULT_EQUIPMENT.gym,
    injuries: [],
    injuryNote: "",
    activityLevel: "light",
    workPostures: [],
    cardioWanted: false,
    cardioTypes: [],
    cardioSessions: 2,
    excludedExerciseIds: [],
  };
}

export default async function OnboardingPage() {
  const user = await requireUser();
  const stored = await getProfile(getDb(), user.id);
  const currentYear = Number(toLocalDate(new Date()).slice(0, 4));
  const defaults = defaultState(user.unitSystem, currentYear);

  let initialState = defaults;
  if (stored) {
    const training = toTrainingProfile(stored);
    const { profile } = stored;
    const weightRange = WEIGHT_RANGE[user.unitSystem];
    initialState = {
      sex: isOneOf(SEXES, profile.sex) ? profile.sex : defaults.sex,
      // Die Auswahlräder kennen nur ganze Zahlen im erlaubten Bereich.
      birthYear: clamp(profile.birthYear, currentYear - MAX_AGE_YEARS, currentYear - MIN_AGE_YEARS),
      heightCm: clamp(Math.round(profile.heightCm), HEIGHT_RANGE_CM.min, HEIGHT_RANGE_CM.max),
      weight: clamp(Math.round(toDisplayWeight(profile.weightKg, user.unitSystem)), weightRange.min, weightRange.max),
      bodyFatPercent: profile.bodyFatPercent === null ? null : Math.round(profile.bodyFatPercent),
      trainingMonths: clamp(profile.trainingMonths ?? 0, 0, MAX_TRAINING_MONTHS),
      trainedRecently: profile.trainedRecently ?? false,
      selfAssessment: isOneOf(SELF_ASSESSMENTS, profile.selfAssessment)
        ? profile.selfAssessment
        : assessmentFromExperience(training.experience),
      goal: training.goal,
      focusMuscles: training.focusMuscles ?? [],
      weekdays: training.weekdays.length > 0 ? training.weekdays : defaults.weekdays,
      sessionMinutes: training.sessionMinutes,
      locationType: stored.locationType,
      equipment: stored.equipment,
      injuries: training.injuries,
      injuryNote: profile.injuryNote ?? "",
      activityLevel: isOneOf(ACTIVITY_LEVELS, profile.activityLevel) ? profile.activityLevel : defaults.activityLevel,
      workPostures: profile.workPostures.filter((item): item is WorkPosture => isOneOf(WORK_POSTURES, item)),
      cardioWanted: profile.cardio.wanted,
      cardioTypes: profile.cardio.types.filter((type): type is CardioType => isOneOf(CARDIO_TYPES, type)),
      cardioSessions: profile.cardio.sessionsPerWeek || defaults.cardioSessions,
      excludedExerciseIds: training.excludedExerciseIds,
    };
  }

  const exercises = (await getUserCatalog(getDb(), user.id)).all
    .filter((exercise) => exercise.pattern !== "cardio")
    .map(({ id, name }) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <OnboardingWizard
      initialState={initialState}
      unitSystem={user.unitSystem}
      currentYear={currentYear}
      exercises={exercises}
      defaultEquipment={DEFAULT_EQUIPMENT}
      pushPublicKey={getEnv().VAPID_PUBLIC_KEY}
    />
  );
}
