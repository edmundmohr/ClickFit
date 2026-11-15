import type { Equipment, Muscle } from "@/domain/exercises/types";
import {
  estimateBodyFat,
  experienceFromAssessment,
  type SelfAssessment,
  type WorkPosture,
} from "@/domain/training/onboarding";
import type {
  ActivityLevel,
  BodyRegion,
  CardioType,
  Goal,
  LocationType,
  SessionMinutes,
  Sex,
  Weekday,
} from "@/domain/training/types";
import { fromDisplayWeight, type UnitSystem } from "@/lib/units";
import type { OnboardingInput } from "../../schemas";

/** Antworten des Fragebogens, solange er ausgefüllt wird. Das Gewicht steht in der Anzeige-Einheit. */
export interface OnboardingState {
  sex: Sex;
  birthYear: number;
  heightCm: number;
  weight: number;
  /** `null`: Der geschätzte Wert gilt, bis der Nutzer ihn ändert. */
  bodyFatPercent: number | null;
  trainingMonths: number;
  trainedRecently: boolean;
  selfAssessment: SelfAssessment;
  goal: Goal;
  focusMuscles: Muscle[];
  weekdays: Weekday[];
  sessionMinutes: SessionMinutes;
  locationType: LocationType;
  equipment: Equipment[];
  injuries: BodyRegion[];
  injuryNote: string;
  activityLevel: ActivityLevel;
  workPostures: WorkPosture[];
  cardioWanted: boolean;
  cardioTypes: CardioType[];
  cardioSessions: number;
  excludedExerciseIds: string[];
}

export const SECTIONS = ["profile", "goals", "needs"] as const;
export type SectionId = (typeof SECTIONS)[number];

/** Alle Fragen in ihrer Reihenfolge: eine Frage pro Bildschirm, gegliedert in drei Abschnitte. */
export const STEPS = [
  { id: "sex", section: "profile" },
  { id: "birth", section: "profile" },
  { id: "height", section: "profile" },
  { id: "weight", section: "profile" },
  { id: "bodyFat", section: "profile" },
  { id: "trainingAge", section: "goals" },
  { id: "assessment", section: "goals" },
  { id: "goal", section: "goals" },
  { id: "focus", section: "goals" },
  { id: "frequency", section: "needs" },
  { id: "location", section: "needs" },
  { id: "week", section: "needs" },
  { id: "reminder", section: "needs" },
  { id: "pain", section: "needs" },
  { id: "activity", section: "needs" },
  { id: "work", section: "needs" },
  { id: "cardio", section: "needs" },
  { id: "excluded", section: "needs" },
] as const satisfies readonly { id: string; section: SectionId }[];
export type StepId = (typeof STEPS)[number]["id"];

/** Akzentfarbe je Abschnitt; sie färbt Hintergrund, Abzeichen und Auswahl. */
export const SECTION_TINTS: Record<SectionId, string> = {
  profile: "var(--status-good)",
  goals: "var(--viz-2)",
  needs: "var(--status-warning)",
};

export const MIN_AGE_YEARS = 12;
export const MAX_AGE_YEARS = 100;
export const HEIGHT_RANGE_CM = { min: 100, max: 250 } as const;
/** Wählbares Gewicht in der Anzeige-Einheit; beide Bereiche liegen innerhalb von 30 bis 400 kg. */
export const WEIGHT_RANGE: Record<UnitSystem, { min: number; max: number }> = {
  metric: { min: 30, max: 250 },
  imperial: { min: 67, max: 550 },
};

export function range(min: number, max: number): number[] {
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Körperfett-Schätzung aus den bisherigen Angaben. */
export function estimatedBodyFat(state: OnboardingState, unitSystem: UnitSystem, currentYear: number): number {
  return estimateBodyFat({
    sex: state.sex,
    ageYears: currentYear - state.birthYear,
    heightCm: state.heightCm,
    weightKg: fromDisplayWeight(state.weight, unitSystem),
  });
}

export function toOnboardingInput(
  state: OnboardingState,
  unitSystem: UnitSystem,
  currentYear: number,
): OnboardingInput {
  return {
    goal: state.goal,
    experience: experienceFromAssessment(state.selfAssessment),
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
    birthYear: state.birthYear,
    heightCm: state.heightCm,
    weightKg: fromDisplayWeight(state.weight, unitSystem),
    activityLevel: state.activityLevel,
    injuries: state.injuries,
    injuryNote: state.injuryNote,
    excludedExerciseIds: state.excludedExerciseIds,
    bodyFatPercent: state.bodyFatPercent ?? estimatedBodyFat(state, unitSystem, currentYear),
    trainingMonths: state.trainingMonths,
    trainedRecently: state.trainedRecently,
    selfAssessment: state.selfAssessment,
    focusMuscles: state.focusMuscles,
    workPostures: state.workPostures,
  };
}
