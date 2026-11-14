/**
 * Fokus-Training: eine einzelne Einheit für ausgewählte Körperregionen (z. B. nur Arme oder
 * Brust und Schultern). Unabhängig vom Wochenplan, deterministisch wie der Plan-Generator.
 */
import type { Exercise, MovementPattern, Muscle } from "@/domain/exercises/types";
import { filterCandidates, pickForSlot, type PreferenceMap } from "./plan-generator";
import {
  WARMUP_SECONDS,
  estimateExerciseSeconds,
  fillWithinBudget,
  prescribe,
  reduceSets,
} from "./plan-generator/prescription";
import type { Slot } from "./plan-generator/templates";
import type { PlannedExercise, TrainingProfile } from "./types";

export const FOCUS_AREAS = ["chest", "back", "shoulders", "arms", "core", "glutes", "legs"] as const;
export type FocusArea = (typeof FOCUS_AREAS)[number];

/** Wählbare Dauer in Minuten. Kürzer als sonst üblich, weil oft nur eine Region dran ist. */
export const FOCUS_MINUTES = [20, 30, 45, 60, 75, 90] as const;
export type FocusMinutes = (typeof FOCUS_MINUTES)[number];

/** Mehr Übungen werden auch dann nicht geplant, wenn die Zeit reichen würde. */
const MAX_EXERCISES = 8;

/** Muskelgruppen je Region – für die Anzeige der Erholung. */
export const FOCUS_AREA_MUSCLES: Record<FocusArea, readonly Muscle[]> = {
  chest: ["chest"],
  back: ["lats", "upper_back", "traps", "lower_back"],
  shoulders: ["front_delts", "side_delts", "rear_delts"],
  arms: ["biceps", "triceps", "forearms"],
  core: ["abs", "obliques"],
  glutes: ["glutes", "abductors"],
  legs: ["quads", "hamstrings", "calves", "adductors"],
};

const compound = (patterns: MovementPattern[], muscles?: Muscle[]): Slot => ({ patterns, muscles, kind: "compound" });
const accessory = (patterns: MovementPattern[], muscles?: Muscle[]): Slot => ({ patterns, muscles, kind: "accessory" });

/**
 * Slots je Region in Prioritätsreihenfolge. Wiederholte Slots ergeben eine zweite Variante
 * (z. B. Schrägbank nach Flachbank), weil eine Übung pro Einheit nur einmal vorkommt.
 */
export const FOCUS_SLOTS: Record<FocusArea, readonly Slot[]> = {
  chest: [
    compound(["horizontal_push"], ["chest"]),
    accessory(["chest_fly"]),
    compound(["horizontal_push"], ["chest"]),
    accessory(["chest_fly", "horizontal_push"], ["chest"]),
  ],
  back: [
    compound(["vertical_pull", "horizontal_pull"]),
    compound(["horizontal_pull", "vertical_pull"]),
    compound(["horizontal_pull", "vertical_pull"]),
    accessory(["back_extension", "hinge"]),
    accessory(["shrug"]),
    accessory(["vertical_pull", "horizontal_pull"]),
  ],
  shoulders: [
    compound(["vertical_push"]),
    accessory(["shoulder_raise"], ["side_delts"]),
    accessory(["rear_delt"]),
    accessory(["shoulder_raise"], ["side_delts", "front_delts"]),
    accessory(["rear_delt"]),
    // Zweite Drückvariante: Ohne Geräte gibt es kaum Seitheben, dann bleibt es nicht bei zwei Übungen.
    accessory(["vertical_push"]),
  ],
  arms: [
    accessory(["elbow_flexion"], ["biceps"]),
    accessory(["elbow_extension"]),
    accessory(["elbow_flexion"], ["biceps"]),
    accessory(["elbow_extension"]),
    accessory(["grip", "elbow_flexion", "carry"], ["forearms"]),
    // Enges Drücken (z. B. Diamant-Liegestütz): ohne Geräte oft die einzige zweite Trizepsübung.
    accessory(["horizontal_push"], ["triceps"]),
  ],
  core: [
    accessory(["core_stability", "core_flexion"]),
    accessory(["core_flexion", "core_rotation"]),
    accessory(["core_rotation", "core_flexion"]),
    accessory(["core_flexion", "core_stability"]),
    accessory(["core_stability", "core_rotation"]),
  ],
  glutes: [
    compound(["hip_thrust", "hinge"]),
    compound(["hinge", "hip_thrust"]),
    compound(["lunge", "squat"]),
    accessory(["hip_abduction"]),
    accessory(["hip_thrust", "hip_abduction"]),
  ],
  legs: [
    compound(["squat", "lunge"]),
    compound(["hinge", "hip_thrust"]),
    compound(["lunge", "squat"]),
    accessory(["knee_extension"]),
    accessory(["knee_flexion"]),
    accessory(["calf_raise"]),
  ],
};

export function isFocusArea(value: string): value is FocusArea {
  return (FOCUS_AREAS as readonly string[]).includes(value);
}

/** Liest die Regionen aus einem URL- oder Formularwert (`chest,arms`), ohne Dubletten, in fester Reihenfolge. */
export function parseFocusAreas(value: unknown): FocusArea[] {
  const raw = Array.isArray(value) ? value.join(",") : typeof value === "string" ? value : "";
  const wanted = new Set(raw.split(",").map((part) => part.trim()));
  return FOCUS_AREAS.filter((area) => wanted.has(area));
}

/** Liest die Dauer; ohne gültigen Wert `null` (dann gilt die Dauer aus dem Profil). */
export function parseFocusMinutes(value: unknown): FocusMinutes | null {
  const number = typeof value === "string" ? Number(value) : NaN;
  return FOCUS_MINUTES.find((minutes) => minutes === number) ?? null;
}

/** Die Dauer aus dem Profil, auf die nächste wählbare Stufe gerundet (bei Gleichstand die kürzere). */
export function nearestFocusMinutes(minutes: number): FocusMinutes {
  return FOCUS_MINUTES.reduce((best, option) =>
    Math.abs(option - minutes) < Math.abs(best - minutes) ? option : best,
  );
}

/** Durchschnittliche Erholung der Muskelgruppen einer Region in Prozent. */
export function areaReadiness(area: FocusArea, recovery: Record<Muscle, number>): number {
  const muscles = FOCUS_AREA_MUSCLES[area];
  return Math.round(muscles.reduce((sum, muscle) => sum + recovery[muscle], 0) / muscles.length);
}

/** Slots mehrerer Regionen im Reißverschluss: Jede Region kommt früh dran, auch bei wenig Zeit. */
export function interleaveSlots(areas: readonly FocusArea[]): Slot[] {
  const lists = areas.map((area) => FOCUS_SLOTS[area]);
  const longest = Math.max(0, ...lists.map((list) => list.length));
  const slots: Slot[] = [];
  for (let index = 0; index < longest; index++) {
    for (const list of lists) {
      const slot = list[index];
      if (slot) slots.push(slot);
    }
  }
  return slots;
}

export interface FocusDayOptions {
  minutes: number;
  preferences?: PreferenceMap;
}

/**
 * Stellt die Einheit für die gewählten Regionen zusammen. Hält das Zeitbudget ein (Sätze werden
 * bei Bedarf gekürzt, siehe `fillWithinBudget`) und stellt Grundübungen an den Anfang.
 * Ohne Region oder ohne passende Übung bleibt die Liste leer.
 */
export function buildFocusDay(
  areas: readonly FocusArea[],
  profile: TrainingProfile,
  catalog: readonly Exercise[],
  options: FocusDayOptions,
): PlannedExercise[] {
  if (areas.length === 0) return [];
  const slots = interleaveSlots(areas);
  const candidates = filterCandidates(profile, catalog);
  const none = new Set<string>();
  const budgetSeconds = options.minutes * 60 - WARMUP_SECONDS;

  const fill = (reduceBy: number) => {
    const usedToday = new Set<string>();
    const picked: { entry: PlannedExercise; kind: Slot["kind"] }[] = [];
    let usedSeconds = 0;
    for (const slot of slots) {
      if (picked.length >= MAX_EXERCISES) break;
      const exercise = pickForSlot(slot, {
        candidates,
        usedInWeek: none,
        usedToday,
        preferences: options.preferences,
      });
      if (!exercise) continue;
      const entry = reduceSets(prescribe(exercise, slot.kind, profile.goal, profile.experience), reduceBy);
      const seconds = estimateExerciseSeconds(entry);
      if (usedSeconds + seconds > budgetSeconds) continue;
      picked.push({ entry, kind: slot.kind });
      usedToday.add(exercise.id);
      usedSeconds += seconds;
    }
    return picked;
  };

  // Grundübungen zuerst: Sie brauchen die meiste Frische. Sonst bleibt die Reißverschluss-Reihenfolge.
  return fillWithinBudget(fill)
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => Number(b.kind === "compound") - Number(a.kind === "compound") || a.index - b.index)
    .map((item) => item.entry);
}
