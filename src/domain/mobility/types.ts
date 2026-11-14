/**
 * Grundtypen für Mobility: Übungen, Routinen und die ausgerollten Schritte des geführten Ablaufs.
 * Reine Typen und Konstanten ohne Framework.
 */

export const MOBILITY_REGIONS = [
  "neck",
  "shoulders",
  "thoracic_spine",
  "lower_back",
  "hips",
  "hamstrings",
  "knees",
  "ankles",
  "wrists",
  "full_body",
] as const;
export type MobilityRegion = (typeof MOBILITY_REGIONS)[number];

/** Beschwerden und Anlässe, nach denen sich Routinen auswählen lassen. */
export const MOBILITY_COMPLAINTS = [
  "desk_stiffness",
  "lower_back_pain",
  "tight_hips",
  "shoulder_tension",
  "neck_tension",
  "knee_discomfort",
  "post_leg_day",
  "post_upper_day",
  "morning_stiffness",
] as const;
export type MobilityComplaint = (typeof MOBILITY_COMPLAINTS)[number];

/** Beschwerden, bei denen die Routine den Hinweis auf ärztliche Abklärung tragen muss. */
export const PAIN_COMPLAINTS: readonly MobilityComplaint[] = [
  "lower_back_pain",
  "shoulder_tension",
  "neck_tension",
  "knee_discomfort",
];

export const MOBILITY_LEVELS = ["easy", "moderate"] as const;
export type MobilityLevel = (typeof MOBILITY_LEVELS)[number];

export const MOBILITY_SIDES = ["left", "right"] as const;
export type MobilitySide = (typeof MOBILITY_SIDES)[number];

/** Eine Übung wird entweder gehalten (Sekunden) oder wiederholt – nie beides. */
export type MobilityDose =
  | { durationSeconds: number; reps?: never; repSeconds?: never }
  | {
      reps: number;
      durationSeconds?: never;
      /** Dauer einer Wiederholung für die Zeitschätzung; Standard: `DEFAULT_REP_SECONDS`. */
      repSeconds?: number;
    };

interface MobilityExerciseBase {
  /** Kennung in kebab-case. */
  id: string;
  name: string;
  /** Angesprochene Regionen; die erste ist der Schwerpunkt. */
  regions: MobilityRegion[];
  /** Dauer bzw. Wiederholungen gelten je Seite; im Ablauf entstehen zwei Schritte. */
  perSide: boolean;
  /** Kurze Schritte, ein Schritt pro Eintrag. */
  instructions: string[];
  hint?: string;
}

export type MobilityExercise = MobilityExerciseBase & MobilityDose;

/** Verweis auf eine Übung; Dauer bzw. Wiederholungen können von der Übung abweichen. */
export interface MobilityRoutineItem {
  exerciseId: string;
  durationSeconds?: number;
  reps?: number;
}

export interface MobilityRoutine {
  id: string;
  name: string;
  description: string;
  /** Die erste Region ist der Schwerpunkt der Routine. */
  regions: MobilityRegion[];
  /** Die erste Beschwerde ist der Hauptanlass; leer bei allgemeinen Routinen. */
  complaints: MobilityComplaint[];
  level: MobilityLevel;
  items: MobilityRoutineItem[];
}

export type MobilityExerciseLookup = ReadonlyMap<string, MobilityExercise>;

/** Ein Schritt im geführten Ablauf: eine Übung, bei `perSide` eine Seite davon. */
export interface MobilityStep {
  exercise: MobilityExercise;
  side: MobilitySide | null;
  /** Haltezeit; `null` bei Übungen mit Wiederholungen. */
  durationSeconds: number | null;
  /** Wiederholungen; `null` bei gehaltenen Übungen. */
  reps: number | null;
  /** Geschätzte Dauer des Schritts ohne Wechselzeit. */
  estimatedSeconds: number;
}

/** Kennzahlen einer Routine für Listen, ohne die Übungen selbst. */
export interface MobilityRoutineSummary {
  id: string;
  name: string;
  description: string;
  regions: MobilityRegion[];
  complaints: MobilityComplaint[];
  level: MobilityLevel;
  durationSeconds: number;
  stepCount: number;
}

export interface MobilityFilter {
  region?: MobilityRegion | null;
  complaint?: MobilityComplaint | null;
}
