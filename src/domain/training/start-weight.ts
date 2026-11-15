/**
 * Startgewicht für einen neu erzeugten Plan: ein vorsichtiger Schätzwert für das erste Training
 * einer Übung, die noch nie trainiert wurde. Danach übernimmt die normale Progression.
 *
 * Vorgehen:
 * 1. Geschätztes 1RM = Richtwert (Tabelle) × Körpergewicht, angepasst an Geschlecht und Erfahrung.
 *    Die Erfahrungsstufen liegen bewusst in der unteren Hälfte der jeweiligen Kraftstufe.
 * 2. Arbeitsgewicht = 1RM-Anteil für „obere Wiederholungszahl + Ziel-RIR“ (Epley rückwärts).
 *    Im ersten Training sind dann bei der unteren Wiederholungszahl noch reichlich Reserven.
 * 3. Abschläge für das erste Training (Sehnen und Gelenke gewöhnen sich langsamer als Muskeln an
 *    Last), für das Alter, für Beschwerden in der belasteten Region und für eine Diät.
 * 4. Abrunden auf die vorhandenen Gewichtsstufen. Wäre schon die leere Stange deutlich zu schwer,
 *    bleibt das Feld leer – dann wählt der Nutzer selbst.
 */
import type { Exercise, MovementPattern } from "@/domain/exercises/types";
import { EMPTY_BAR_KG, EQUIPMENT_FACTORS, PATTERN_RATIOS, START_RATIOS } from "./start-weight-table";
import type { BodyRegion, ExperienceLevel, Goal, Sex } from "./types";
import type { WeightLadder } from "./weights";

export interface StartAthlete {
  sex: Sex;
  ageYears: number;
  bodyWeightKg: number;
  experience: ExperienceLevel;
  goal: Goal;
  injuries: readonly BodyRegion[];
}

export type StartExercise = Pick<Exercise, "id" | "type" | "pattern" | "equipment">;

/** Vielfaches des Einsteiger-1RM je Erfahrung (untere Hälfte der Kraftstufen „novice“ bis „advanced“). */
const EXPERIENCE_STRENGTH: Record<ExperienceLevel, number> = { beginner: 1, intermediate: 1.8, advanced: 2.4 };

/** Abschlag fürs erste Training: Technik lernen, Gewöhnung von Sehnen und Gelenken. */
const FIRST_SESSION: Record<ExperienceLevel, number> = { beginner: 0.85, intermediate: 0.9, advanced: 0.95 };

/** Frauen erreichen im Verhältnis zum Körpergewicht oben etwa 55 %, unten etwa 70 % (siehe Kraftstandards). */
const FEMALE_UPPER = 0.55;
const FEMALE_LOWER = 0.7;
const LOWER_BODY: readonly MovementPattern[] = [
  "squat",
  "hinge",
  "lunge",
  "hip_thrust",
  "knee_extension",
  "knee_flexion",
  "hip_abduction",
  "hip_adduction",
  "calf_raise",
  "back_extension",
];

/** Muster, die eine Region spürbar belasten (weiter gefasst als die Muster, die der Generator meidet). */
const LOADED_BY_REGION: Record<BodyRegion, readonly MovementPattern[]> = {
  shoulder: ["horizontal_push", "vertical_push", "shoulder_raise", "chest_fly", "vertical_pull", "rear_delt"],
  elbow: ["elbow_extension", "elbow_flexion", "horizontal_push", "vertical_push", "horizontal_pull", "vertical_pull"],
  wrist: ["grip", "elbow_flexion", "horizontal_push", "vertical_push"],
  lower_back: ["hinge", "back_extension", "squat", "horizontal_pull", "lunge"],
  hip: ["hip_thrust", "hip_abduction", "hip_adduction", "squat", "hinge", "lunge"],
  knee: ["squat", "lunge", "knee_extension", "knee_flexion"],
  ankle: ["calf_raise", "squat", "lunge"],
  neck: ["shrug", "vertical_push"],
};
const INJURY_FACTOR = 0.8;
/** Im Kaloriendefizit erholen sich Muskeln und Sehnen langsamer. */
const FAT_LOSS_FACTOR = 0.95;
/** Kraft wächst nicht linear mit dem Körpergewicht: Über dieser Grenze zählt jedes Kilo nur halb. */
const BODY_WEIGHT_KNEE_KG = 90;
/** Liegt der Schätzwert unter diesem Anteil der leichtesten Stufe, wäre die Stufe zu schwer. */
const MIN_STEP_SHARE = 0.75;
/** Aufrunden auf die nächste Stufe nur, wenn sie höchstens 10 % über dem Schätzwert liegt. */
const ROUND_UP_TOLERANCE = 1.1;

/** Unterstützung (Anteil am Körpergewicht) an Klimmzug- und Dip-Maschine. */
const ASSISTANCE: Record<Sex, Record<ExperienceLevel, number>> = {
  male: { beginner: 0.45, intermediate: 0.3, advanced: 0.15 },
  female: { beginner: 0.6, intermediate: 0.45, advanced: 0.3 },
};
const MAX_ASSISTANCE_SHARE = 0.9;

function clean(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Körpergewicht, mit dem gerechnet wird. */
export function effectiveBodyWeight(bodyWeightKg: number): number {
  if (bodyWeightKg <= BODY_WEIGHT_KNEE_KG) return bodyWeightKg;
  return BODY_WEIGHT_KNEE_KG + (bodyWeightKg - BODY_WEIGHT_KNEE_KG) / 2;
}

export function ageFactor(ageYears: number): number {
  if (ageYears >= 70) return 0.7;
  if (ageYears >= 60) return 0.8;
  if (ageYears >= 50) return 0.9;
  if (ageYears >= 40) return 0.95;
  return 1;
}

export function injuryFactor(pattern: MovementPattern, injuries: readonly BodyRegion[]): number {
  return injuries.some((region) => LOADED_BY_REGION[region].includes(pattern)) ? INJURY_FACTOR : 1;
}

/** Anteil am 1RM, mit dem genau `repsToFailure` Wiederholungen möglich sind (Epley umgestellt). */
export function oneRepMaxShare(repsToFailure: number): number {
  return 1 / (1 + Math.max(repsToFailure, 1) / 30);
}

/** Richtwert der Übung; eigene Übungen nach Bewegungsmuster und Gerät. */
export function startRatio(exercise: StartExercise): number {
  const listed = START_RATIOS[exercise.id];
  if (listed !== undefined) return listed;
  const factor = exercise.equipment.reduce((lowest, item) => Math.min(lowest, EQUIPMENT_FACTORS[item] ?? 1), 1);
  return PATTERN_RATIOS[exercise.pattern] * factor;
}

/** Ungerundetes Startgewicht in kg (vor dem Runden auf die Gewichtsstufen). */
export function rawStartWeightKg(
  exercise: StartExercise,
  athlete: StartAthlete,
  prescription: { repMax: number; targetRir: number },
): number {
  const sexFactor =
    athlete.sex === "female" ? (LOWER_BODY.includes(exercise.pattern) ? FEMALE_LOWER : FEMALE_UPPER) : 1;
  const oneRepMax =
    startRatio(exercise) * effectiveBodyWeight(athlete.bodyWeightKg) * sexFactor * EXPERIENCE_STRENGTH[athlete.experience];
  return (
    oneRepMax *
    oneRepMaxShare(prescription.repMax + prescription.targetRir) *
    FIRST_SESSION[athlete.experience] *
    ageFactor(athlete.ageYears) *
    injuryFactor(exercise.pattern, athlete.injuries) *
    (athlete.goal === "fat_loss" ? FAT_LOSS_FACTOR : 1)
  );
}

/** Unterstützung für Klimmzug- und Dip-Maschine: lieber zu viel als zu wenig, aufgerundet. */
function startAssistanceKg(exercise: StartExercise, athlete: StartAthlete, ladder: StartLadder): number {
  const share = ASSISTANCE[athlete.sex][athlete.experience];
  const caution = ageFactor(athlete.ageYears) * injuryFactor(exercise.pattern, athlete.injuries);
  const assistance = Math.min((athlete.bodyWeightKg * share) / caution, athlete.bodyWeightKg * MAX_ASSISTANCE_SHARE);
  const nearest = ladder.nearest(assistance);
  return clean(nearest < assistance ? ladder.up(nearest) : nearest);
}

export type StartLadder = Pick<WeightLadder, "nearest" | "down" | "up">;

/**
 * Startgewicht in kg oder `null`, wenn die App keins vorschlagen soll: Übungen ohne Zusatzgewicht,
 * mit Körpergewicht plus Zusatzlast (Start ohne Zusatz) oder wenn schon die leichteste Stufe zu schwer wäre.
 */
export function startWeightKg(
  exercise: StartExercise,
  athlete: StartAthlete,
  prescription: { repMax: number; targetRir: number },
  ladder: StartLadder,
): number | null {
  if (athlete.bodyWeightKg <= 0) return null;
  if (exercise.type === "assisted_bodyweight") return startAssistanceKg(exercise, athlete, ladder);
  if (exercise.type !== "weight_reps") return null;

  const raw = rawStartWeightKg(exercise, athlete, prescription);
  const emptyBar = Math.max(0, ...exercise.equipment.map((item) => EMPTY_BAR_KG[item] ?? 0));
  // Leichteste mögliche Last: leere Stange, kleinste Hantel bzw. erste Stufe.
  const lightest = Math.max(ladder.up(0), emptyBar);
  if (raw < lightest * MIN_STEP_SHARE) return null;
  if (raw <= lightest) return clean(lightest);

  // Nächste Stufe, aber höchstens knapp darüber; sonst lieber eine Stufe leichter.
  const nearest = ladder.nearest(raw);
  const rounded = nearest > raw * ROUND_UP_TOLERANCE ? ladder.down(nearest) : nearest;
  const result = Math.max(rounded, lightest);
  return result > 0 ? clean(result) : null;
}
