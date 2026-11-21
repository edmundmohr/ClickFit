/**
 * Übungen mit abgenommener Illustration unter `public/illustrations/exercises/<id>.jpg`
 * (960 × 716 px, Erzeugung siehe docs/GRAPHICS.md). Übungen ohne Eintrag zeigen nur den Text.
 */
export const ILLUSTRATED_EXERCISE_IDS: readonly string[] = [
  "back-extension",
  "band-chest-fly",
  "band-lat-pulldown",
  "band-seated-row",
  "barbell-bench-press",
  "barbell-row",
  "barbell-shrug",
  "cable-crossover",
  "chest-press-machine",
  "dumbbell-bench-press",
  "dumbbell-fly",
  "dumbbell-row",
  "dumbbell-shoulder-press",
  "dumbbell-shrug",
  "lat-pulldown",
  "overhead-press",
  "pec-deck",
  "pull-up",
  "push-up",
  "seated-cable-row",
  "seated-row-machine",
  "superman",
  "suspension-row",
  "table-inverted-row",
];

export const EXERCISE_ILLUSTRATION_WIDTH = 960;
export const EXERCISE_ILLUSTRATION_HEIGHT = 716;

const illustrated = new Set(ILLUSTRATED_EXERCISE_IDS);

/** Pfad der Illustration oder `null`, wenn es für die Übung (noch) keine gibt. */
export function exerciseIllustrationPath(exerciseId: string): string | null {
  return illustrated.has(exerciseId) ? `/illustrations/exercises/${exerciseId}.jpg` : null;
}
