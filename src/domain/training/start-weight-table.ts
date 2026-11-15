/**
 * Richtwerte für das Startgewicht: geschätztes 1RM eines männlichen Einsteigers im Verhältnis
 * zum Körpergewicht. Bei Kurzhanteln gilt der Wert pro Hantel, bei einseitigen Übungen pro Seite.
 *
 * Grundlage sind die verbreiteten Kraftstandards (siehe `LEVEL_THRESHOLDS` in
 * `domain/progress/strength.ts`: Einsteiger-Bankdrücken etwa 0,5 × Körpergewicht, Kniebeuge 0,75,
 * Kreuzheben 1,0). Die übrigen Übungen sind daraus abgeleitet und eher vorsichtig angesetzt;
 * Maschinen unterscheiden sich je nach Hersteller stark, deshalb liegen sie am unteren Rand.
 */
import type { Equipment, MovementPattern } from "@/domain/exercises/types";

export const START_RATIOS: Readonly<Record<string, number>> = {
  // Kniebeuge
  "barbell-back-squat": 0.75,
  "barbell-front-squat": 0.6,
  "smith-machine-squat": 0.65,
  "hack-squat": 0.8,
  "leg-press": 1.4,
  "goblet-squat": 0.35,
  "kettlebell-goblet-squat": 0.35,
  "dumbbell-sumo-squat": 0.4,
  // Hüftbeuge
  deadlift: 1,
  "sumo-deadlift": 0.95,
  "romanian-deadlift": 0.7,
  "rack-pull": 1,
  "good-morning": 0.4,
  "dumbbell-romanian-deadlift": 0.3,
  "single-leg-dumbbell-romanian-deadlift": 0.15,
  "kettlebell-deadlift": 0.45,
  "kettlebell-swing": 0.3,
  "cable-pull-through": 0.4,
  // Ausfallschritte
  "barbell-lunge": 0.4,
  "dumbbell-lunge": 0.18,
  "walking-lunge": 0.18,
  "bulgarian-split-squat": 0.15,
  "dumbbell-step-up": 0.15,
  // Hüftstrecken
  "barbell-hip-thrust": 0.9,
  "smith-machine-hip-thrust": 0.8,
  "hip-thrust-machine": 0.8,
  "dumbbell-hip-thrust": 0.4,
  "dumbbell-glute-bridge": 0.35,
  "cable-kickback": 0.1,
  // Beinstrecker, Beinbeuger, Abduktoren, Adduktoren, Waden
  "leg-extension": 0.5,
  "dumbbell-leg-extension": 0.1,
  "lying-leg-curl": 0.4,
  "seated-leg-curl": 0.45,
  "dumbbell-leg-curl": 0.12,
  "hip-abduction-machine": 0.6,
  "hip-adduction-machine": 0.6,
  "cable-hip-abduction": 0.08,
  "cable-hip-adduction": 0.1,
  "standing-calf-raise-machine": 0.9,
  "leg-press-calf-raise": 1.2,
  "seated-calf-raise": 0.5,
  "smith-machine-calf-raise": 0.8,
  "dumbbell-calf-raise": 0.3,
  // Drücken waagerecht
  "barbell-bench-press": 0.5,
  "incline-barbell-bench-press": 0.42,
  "decline-barbell-bench-press": 0.52,
  "close-grip-bench-press": 0.45,
  "smith-machine-bench-press": 0.45,
  "dumbbell-bench-press": 0.2,
  "incline-dumbbell-bench-press": 0.17,
  "dumbbell-floor-press": 0.2,
  "chest-press-machine": 0.5,
  "incline-chest-press-machine": 0.42,
  // Drücken senkrecht
  "overhead-press": 0.35,
  "smith-machine-shoulder-press": 0.32,
  "shoulder-press-machine": 0.35,
  "dumbbell-shoulder-press": 0.14,
  "standing-dumbbell-shoulder-press": 0.13,
  "arnold-press": 0.12,
  "kettlebell-overhead-press": 0.13,
  // Fliegende, Schultern, hintere Schulter, Nacken
  "dumbbell-fly": 0.12,
  "incline-dumbbell-fly": 0.11,
  "cable-crossover": 0.12,
  "low-to-high-cable-fly": 0.1,
  "pec-deck": 0.4,
  "dumbbell-lateral-raise": 0.09,
  "dumbbell-front-raise": 0.1,
  "cable-lateral-raise": 0.07,
  "lateral-raise-machine": 0.25,
  "upright-row": 0.3,
  "dumbbell-reverse-fly": 0.07,
  "cable-reverse-fly": 0.08,
  "reverse-pec-deck": 0.3,
  "face-pull": 0.3,
  "barbell-shrug": 0.8,
  "dumbbell-shrug": 0.35,
  // Ziehen waagerecht
  "barbell-row": 0.5,
  "t-bar-row": 0.45,
  "seated-cable-row": 0.55,
  "seated-row-machine": 0.55,
  "dumbbell-bent-over-row": 0.2,
  "chest-supported-dumbbell-row": 0.18,
  "dumbbell-row": 0.3,
  "kettlebell-row": 0.3,
  // Ziehen senkrecht
  "lat-pulldown": 0.55,
  "close-grip-lat-pulldown": 0.55,
  "reverse-grip-lat-pulldown": 0.55,
  "lat-pulldown-machine": 0.55,
  "straight-arm-pulldown": 0.25,
  "dumbbell-pullover": 0.2,
  // Bizeps und Unterarme
  "barbell-curl": 0.3,
  "ez-bar-curl": 0.28,
  "ez-bar-preacher-curl": 0.24,
  "reverse-curl": 0.2,
  "cable-curl": 0.28,
  "preacher-curl-machine": 0.25,
  "dumbbell-curl": 0.16,
  "hammer-curl": 0.17,
  "incline-dumbbell-curl": 0.13,
  "concentration-curl": 0.14,
  "barbell-wrist-curl": 0.25,
  "wrist-curl": 0.1,
  "reverse-wrist-curl": 0.06,
  // Trizeps
  "triceps-pushdown": 0.32,
  "rope-pushdown": 0.28,
  "overhead-cable-triceps-extension": 0.25,
  "overhead-dumbbell-triceps-extension": 0.18,
  "skull-crusher": 0.25,
  "triceps-kickback": 0.06,
  "triceps-dip-machine": 0.6,
  // Rumpf
  "back-extension-machine": 0.5,
  "cable-crunch": 0.45,
  "ab-crunch-machine": 0.4,
  "weighted-crunch": 0.12,
  "dumbbell-side-bend": 0.25,
  "cable-woodchop": 0.15,
  "dumbbell-woodchop": 0.1,
  "pallof-press": 0.12,
  "turkish-get-up": 0.12,
};

/** Richtwert eigener Übungen nach Bewegungsmuster, bezogen auf Langhantel bzw. Maschine. */
export const PATTERN_RATIOS: Readonly<Record<MovementPattern, number>> = {
  squat: 0.7,
  hinge: 0.7,
  lunge: 0.35,
  hip_thrust: 0.8,
  knee_extension: 0.45,
  knee_flexion: 0.4,
  hip_abduction: 0.5,
  hip_adduction: 0.5,
  calf_raise: 0.8,
  horizontal_push: 0.45,
  vertical_push: 0.33,
  chest_fly: 0.35,
  horizontal_pull: 0.5,
  vertical_pull: 0.5,
  shoulder_raise: 0.22,
  rear_delt: 0.25,
  shrug: 0.7,
  elbow_flexion: 0.25,
  elbow_extension: 0.28,
  back_extension: 0.45,
  core_flexion: 0.35,
  core_rotation: 0.15,
  core_stability: 0.12,
  carry: 0.35,
  grip: 0.2,
  cardio: 0,
};

/** Anteil am Langhantel-/Maschinenwert, wenn eine eigene Übung mit diesem Gerät belastet wird. */
export const EQUIPMENT_FACTORS: Partial<Record<Equipment, number>> = {
  dumbbell: 0.4,
  kettlebell: 0.4,
  cable: 0.8,
  resistance_band: 0,
};

/** Gewichtsteile, die mindestens bewegt werden: leere Lang- bzw. SZ-Stange. */
export const EMPTY_BAR_KG: Partial<Record<Equipment, number>> = {
  barbell: 20,
  ez_bar: 10,
};
