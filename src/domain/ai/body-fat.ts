/**
 * Körperfett-Schätzung aus einem Foto: Die KI liefert eine Spanne; diese Regeln entscheiden,
 * ob sie als grobe Schätzung gespeichert werden darf.
 */

export interface RawBodyFatEstimate {
  canEstimate: boolean;
  lowPercent: number | null;
  highPercent: number | null;
  note: string;
}

export interface BodyFatRange {
  lowPercent: number;
  highPercent: number;
  note: string;
}

const MIN_PERCENT = 3;
const MAX_PERCENT = 60;
/** Eine Schätzung aus einem Foto ist nie genauer als ein paar Prozentpunkte. */
export const MIN_RANGE_WIDTH = 3;
const MAX_RANGE_WIDTH = 15;
const MAX_NOTE_LENGTH = 400;

/** Geprüfte Spanne oder `null`, wenn die Antwort nicht verwendbar ist. */
export function normalizeBodyFatEstimate(raw: RawBodyFatEstimate): BodyFatRange | null {
  if (!raw.canEstimate || raw.lowPercent === null || raw.highPercent === null) return null;
  let low = Math.round(Math.min(raw.lowPercent, raw.highPercent));
  let high = Math.round(Math.max(raw.lowPercent, raw.highPercent));
  if (!Number.isFinite(low) || !Number.isFinite(high) || low < MIN_PERCENT || high > MAX_PERCENT) return null;
  if (high - low > MAX_RANGE_WIDTH) return null;
  // Eine zu schmale Spanne täuscht Genauigkeit vor: auf die Mindestbreite aufweiten.
  if (high - low < MIN_RANGE_WIDTH) {
    const middle = (low + high) / 2;
    low = Math.max(MIN_PERCENT, Math.floor(middle - MIN_RANGE_WIDTH / 2));
    high = Math.min(MAX_PERCENT, low + MIN_RANGE_WIDTH);
  }
  return { lowPercent: low, highPercent: high, note: raw.note.trim().slice(0, MAX_NOTE_LENGTH) };
}
