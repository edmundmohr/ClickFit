/**
 * Übungen mit abgenommener Illustration unter `public/illustrations/exercises/<id>.jpg`
 * (960 × 716 px, Erzeugung siehe docs/GRAPHICS.md). Übungen ohne Eintrag zeigen nur den Text.
 */
export const ILLUSTRATED_EXERCISE_IDS: readonly string[] = [
  "back-extension",
  "band-chest-fly",
  "band-curl",
  "band-lat-pulldown",
  "band-lateral-raise",
  "band-overhead-press",
  "band-pull-apart",
  "band-seated-row",
  "barbell-bench-press",
  "barbell-curl",
  "barbell-row",
  "barbell-shrug",
  "cable-crossover",
  "chest-press-machine",
  "dumbbell-bench-press",
  "dumbbell-curl",
  "dumbbell-fly",
  "dumbbell-lateral-raise",
  "dumbbell-reverse-fly",
  "dumbbell-row",
  "dumbbell-shoulder-press",
  "dumbbell-shrug",
  "face-pull",
  "lat-pulldown",
  "overhead-press",
  "pec-deck",
  "pike-push-up",
  "pull-up",
  "push-up",
  "reverse-pec-deck",
  "seated-cable-row",
  "seated-row-machine",
  "shoulder-press-machine",
  "skull-crusher",
  "superman",
  "suspension-row",
  "table-inverted-row",
  "triceps-pushdown",
  "wrist-curl",
];

export const EXERCISE_ILLUSTRATION_WIDTH = 960;
export const EXERCISE_ILLUSTRATION_HEIGHT = 716;

const illustrated = new Set(ILLUSTRATED_EXERCISE_IDS);

/** Pfad der Illustration oder `null`, wenn es für die Übung (noch) keine gibt. */
export function exerciseIllustrationPath(exerciseId: string): string | null {
  return illustrated.has(exerciseId) ? `/illustrations/exercises/${exerciseId}.jpg` : null;
}
