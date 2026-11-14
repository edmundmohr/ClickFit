import type { Equipment } from "@/domain/exercises/types";
import {
  MAX_TRAINING_DAYS,
  MIN_TRAINING_DAYS,
  type ActivityLevel,
  type BodyRegion,
  type CardioType,
  type ExperienceLevel,
  type Goal,
  type LocationType,
  type SessionMinutes,
  type Sex,
  type Weekday,
} from "@/domain/training/types";
import { fromDisplayWeight, parseDecimal, type UnitSystem } from "@/lib/units";
import type { OnboardingInput } from "../../schemas";

/** Formularzustand des Fragebogens. Zahlenfelder bleiben Text, bis abgeschickt wird. */
export interface OnboardingState {
  goal: Goal;
  experience: ExperienceLevel;
  weekdays: Weekday[];
  sessionMinutes: SessionMinutes;
  locationType: LocationType;
  equipment: Equipment[];
  cardioWanted: boolean;
  cardioTypes: CardioType[];
  cardioSessions: number;
  sex: Sex;
  birthYear: string;
  heightCm: string;
  weight: string;
  activityLevel: ActivityLevel;
  injuries: BodyRegion[];
  injuryNote: string;
  excludedExerciseIds: string[];
}

export const STEPS = ["goal", "experience", "schedule", "location", "cardio", "body", "limits"] as const;
export type StepId = (typeof STEPS)[number];

export type StepError = "days" | "body" | null;

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

function parseBody(state: OnboardingState, unitSystem: UnitSystem) {
  const birthYear = parseDecimal(state.birthYear);
  const heightCm = parseDecimal(state.heightCm);
  const weight = parseDecimal(state.weight);
  if (birthYear === null || heightCm === null || weight === null) return null;
  const year = new Date().getFullYear();
  const weightKg = fromDisplayWeight(weight, unitSystem);
  const valid =
    Number.isInteger(birthYear) &&
    birthYear >= year - 100 &&
    birthYear <= year - 12 &&
    heightCm >= 100 &&
    heightCm <= 250 &&
    weightKg >= 30 &&
    weightKg <= 400;
  return valid ? { birthYear, heightCm, weightKg } : null;
}

/** Prüft den aktuellen Schritt, bevor es weitergeht. */
export function validateStep(step: StepId, state: OnboardingState, unitSystem: UnitSystem): StepError {
  if (step === "schedule") {
    const count = state.weekdays.length;
    return count >= MIN_TRAINING_DAYS && count <= MAX_TRAINING_DAYS ? null : "days";
  }
  if (step === "body") return parseBody(state, unitSystem) ? null : "body";
  return null;
}

export function toOnboardingInput(state: OnboardingState, unitSystem: UnitSystem): OnboardingInput | null {
  const body = parseBody(state, unitSystem);
  if (!body) return null;
  return {
    goal: state.goal,
    experience: state.experience,
    weekdays: state.weekdays,
    sessionMinutes: state.sessionMinutes,
    locationType: state.locationType,
    equipment: state.equipment,
    cardio: {
      wanted: state.cardioWanted,
      types: state.cardioWanted ? state.cardioTypes : [],
      sessionsPerWeek: state.cardioWanted ? state.cardioSessions : 0,
    },
    sex: state.sex,
    ...body,
    activityLevel: state.activityLevel,
    injuries: state.injuries,
    injuryNote: state.injuryNote,
    excludedExerciseIds: state.excludedExerciseIds,
  };
}
