import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { gymProfile, userProfile } from "@/db/schema";
import { EQUIPMENT, isEquipment, isMuscle, type Equipment } from "@/domain/exercises/types";
import {
  BODY_REGIONS,
  EXPERIENCE_LEVELS,
  GOALS,
  LOCATION_TYPES,
  SESSION_MINUTES,
  isOneOf,
  type BodyRegion,
  type LocationType,
  type SessionMinutes,
  type TrainingProfile,
  type Weekday,
} from "@/domain/training/types";
import { newId } from "@/lib/tokens";
import type { OnboardingInput } from "../schemas";

/** Im Studio ist standardmäßig alles vorhanden. */
export const DEFAULT_EQUIPMENT: Record<LocationType, Equipment[]> = {
  gym: [...EQUIPMENT],
  home: ["dumbbell", "bench", "resistance_band"],
  travel: [],
};

export type StoredProfile = typeof userProfile.$inferSelect;

export interface ProfileWithLocation {
  profile: StoredProfile;
  locationType: LocationType;
  equipment: Equipment[];
  gymProfileId: string | null;
}

function toWeekdays(values: number[]): Weekday[] {
  return values.filter((value): value is Weekday => Number.isInteger(value) && value >= 1 && value <= 7);
}

export async function getProfile(db: AppDatabase, userId: string): Promise<ProfileWithLocation | null> {
  const profile = await db.query.userProfile.findFirst({ where: eq(userProfile.userId, userId) });
  if (!profile) return null;
  const location = await db.query.gymProfile.findFirst({
    where: and(eq(gymProfile.userId, userId), eq(gymProfile.isDefault, true)),
  });
  return {
    profile,
    locationType: isOneOf(LOCATION_TYPES, location?.type) ? location.type : "gym",
    equipment: (location?.equipment ?? []).filter(isEquipment),
    gymProfileId: location?.id ?? null,
  };
}

/** Wandelt das gespeicherte Profil in die Eingabe des Plan-Generators um. */
export function toTrainingProfile(stored: ProfileWithLocation): TrainingProfile {
  const { profile } = stored;
  const minutes = SESSION_MINUTES.find((value) => value === profile.sessionMinutes);
  const sessionMinutes: SessionMinutes = minutes ?? 60;
  return {
    goal: isOneOf(GOALS, profile.goal) ? profile.goal : "muscle_gain",
    experience: isOneOf(EXPERIENCE_LEVELS, profile.experience) ? profile.experience : "beginner",
    weekdays: toWeekdays(profile.weekdays),
    sessionMinutes,
    equipment: stored.equipment,
    excludedExerciseIds: profile.excludedExerciseIds,
    injuries: profile.injuries.filter((region): region is BodyRegion => isOneOf(BODY_REGIONS, region)),
    focusMuscles: profile.focusMuscles.filter(isMuscle),
  };
}

/** Speichert die Onboarding-Antworten. Der Hauptort ersetzt den bisherigen Standard-Ort. */
export async function saveOnboarding(
  db: AppDatabase,
  userId: string,
  input: OnboardingInput,
  now = new Date(),
): Promise<void> {
  const values = {
    goal: input.goal,
    experience: input.experience,
    weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b),
    sessionMinutes: input.sessionMinutes,
    cardio: input.cardio,
    sex: input.sex,
    birthYear: input.birthYear,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    activityLevel: input.activityLevel,
    injuries: input.injuries,
    injuryNote: input.injuryNote || null,
    excludedExerciseIds: input.excludedExerciseIds,
    bodyFatPercent: input.bodyFatPercent ?? null,
    trainingMonths: input.trainingMonths ?? null,
    trainedRecently: input.trainedRecently ?? null,
    selfAssessment: input.selfAssessment ?? null,
    focusMuscles: input.focusMuscles ?? [],
    workPostures: input.workPostures ?? [],
    updatedAt: now,
  };
  // Der aktive Ort wird angepasst, nicht ersetzt: Stange, Scheiben und Gewichtsstufen bleiben erhalten.
  const active = await db.query.gymProfile.findFirst({
    where: and(eq(gymProfile.userId, userId), eq(gymProfile.isDefault, true)),
  });
  await db.batch([
    db
      .insert(userProfile)
      .values({ userId, ...values, completedAt: now })
      .onConflictDoUpdate({ target: userProfile.userId, set: values }),
    active
      ? db
          .update(gymProfile)
          .set({ type: input.locationType, equipment: input.equipment, updatedAt: now })
          .where(eq(gymProfile.id, active.id))
      : db.insert(gymProfile).values({
          id: newId(),
          userId,
          type: input.locationType,
          equipment: input.equipment,
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        }),
  ]);
}
