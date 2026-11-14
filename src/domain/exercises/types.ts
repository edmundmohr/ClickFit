/**
 * Grundtypen der Übungsbibliothek. Reine Typen und Konstanten ohne Framework,
 * damit Plan-Generator, Progression und Tests sie gemeinsam nutzen können.
 */

export const MUSCLES = [
  "chest",
  "lats",
  "upper_back",
  "traps",
  "lower_back",
  "front_delts",
  "side_delts",
  "rear_delts",
  "biceps",
  "triceps",
  "forearms",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "calves",
  "adductors",
  "abductors",
] as const;
export type Muscle = (typeof MUSCLES)[number];

export const EQUIPMENT = [
  "barbell",
  "ez_bar",
  "dumbbell",
  "kettlebell",
  "bench",
  "rack",
  "pull_up_bar",
  "dip_bars",
  "cable",
  "machine",
  "smith_machine",
  "resistance_band",
  "suspension_trainer",
  "ab_wheel",
  "box",
  "jump_rope",
  "cardio_machine",
] as const;
export type Equipment = (typeof EQUIPMENT)[number];

/** Bewegungsmuster: Grundlage für die Slots des Plan-Generators und später den Verletztenmodus. */
export const MOVEMENT_PATTERNS = [
  "horizontal_push",
  "vertical_push",
  "chest_fly",
  "horizontal_pull",
  "vertical_pull",
  "shoulder_raise",
  "rear_delt",
  "shrug",
  "elbow_flexion",
  "elbow_extension",
  "squat",
  "hinge",
  "lunge",
  "hip_thrust",
  "knee_extension",
  "knee_flexion",
  "hip_abduction",
  "hip_adduction",
  "calf_raise",
  "core_flexion",
  "core_stability",
  "core_rotation",
  "back_extension",
  "carry",
  "grip",
  "cardio",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

/**
 * Wie eine Übung geloggt wird:
 * - weight_reps: Gewicht × Wiederholungen
 * - bodyweight_reps: nur Wiederholungen
 * - weighted_bodyweight: Körpergewicht plus Zusatzgewicht (z. B. Dips mit Gürtel)
 * - assisted_bodyweight: Körpergewicht minus Unterstützung (z. B. Klimmzug-Maschine)
 * - duration: Zeit (z. B. Plank)
 * - distance_duration: Distanz und Zeit (Cardio)
 */
export const EXERCISE_TYPES = [
  "weight_reps",
  "bodyweight_reps",
  "weighted_bodyweight",
  "assisted_bodyweight",
  "duration",
  "distance_duration",
] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const MECHANICS = ["compound", "isolation"] as const;
export type Mechanic = (typeof MECHANICS)[number];

export interface Exercise {
  /** Stabile, englische Kennung in kebab-case, z. B. `barbell-bench-press`. */
  id: string;
  /** Deutscher Anzeigename. */
  name: string;
  type: ExerciseType;
  mechanic: Mechanic;
  pattern: MovementPattern;
  primary: Muscle[];
  secondary: Muscle[];
  /** Alles, was für die Übung vorhanden sein muss. Leer = ohne Geräte machbar. */
  equipment: Equipment[];
  difficulty: Difficulty;
  /** 1 = Standardübung (erste Wahl des Generators), 2 = gute Variante, 3 = Spezialübung. */
  priority: 1 | 2 | 3;
  /** Wird pro Seite ausgeführt (z. B. einarmiges Rudern). */
  unilateral?: boolean;
  /** Kurze Anleitung auf Deutsch, ein Schritt pro Eintrag. */
  instructions: string[];
}

export function isMuscle(value: string): value is Muscle {
  return (MUSCLES as readonly string[]).includes(value);
}

export function isEquipment(value: string): value is Equipment {
  return (EQUIPMENT as readonly string[]).includes(value);
}
