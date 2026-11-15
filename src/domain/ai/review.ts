/**
 * KI-Auswertung aller Daten: Die KI liefert eine Einschätzung je Bereich und Empfehlungen;
 * diese Regeln prüfen und kürzen die Antwort, bevor sie gespeichert und angezeigt wird.
 */

export const REVIEW_AREAS = ["training", "nutrition", "body", "recovery", "cardio", "everyday"] as const;
export type ReviewArea = (typeof REVIEW_AREAS)[number];

/** `good` = läuft, `watch` = im Blick behalten, `act` = Handlungsbedarf. */
export const REVIEW_STATUSES = ["good", "watch", "act"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const MAX_REVIEW_QUESTION_LENGTH = 500;
const MAX_SUMMARY_LENGTH = 800;
const MAX_TEXT_LENGTH = 600;
export const MAX_RECOMMENDATIONS = 6;
const MAX_DATA_GAPS = 4;
const MAX_ANSWER_LENGTH = 1200;

export interface RawReview {
  summary: string;
  answer: string | null;
  areas: { area: string; status: string; text: string }[];
  recommendations: { area: string; text: string }[];
  dataGaps: string[];
}

export interface AiReview {
  summary: string;
  /** Antwort auf die Frage der Person; `null` ohne Frage. */
  answer: string | null;
  areas: { area: ReviewArea; status: ReviewStatus; text: string }[];
  recommendations: { area: ReviewArea; text: string }[];
  /** Daten, deren Fehlen die Auswertung einschränkt. */
  dataGaps: string[];
}

const isArea = (value: string): value is ReviewArea => (REVIEW_AREAS as readonly string[]).includes(value);
const isStatus = (value: string): value is ReviewStatus => (REVIEW_STATUSES as readonly string[]).includes(value);
const clean = (text: string, max: number) => text.replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Geprüfte Auswertung oder `null`, wenn die Antwort nichts Verwertbares enthält. Unbekannte
 * Bereiche fallen weg, jeder Bereich kommt höchstens einmal vor (in fester Reihenfolge).
 */
export function normalizeReview(raw: RawReview, withQuestion: boolean): AiReview | null {
  const summary = clean(raw.summary, MAX_SUMMARY_LENGTH);
  const byArea = new Map<ReviewArea, AiReview["areas"][number]>();
  for (const item of raw.areas) {
    const text = clean(item.text, MAX_TEXT_LENGTH);
    if (!isArea(item.area) || !isStatus(item.status) || text === "" || byArea.has(item.area)) continue;
    byArea.set(item.area, { area: item.area, status: item.status, text });
  }
  const areas = REVIEW_AREAS.flatMap((area) => {
    const item = byArea.get(area);
    return item ? [item] : [];
  });
  const recommendations = raw.recommendations
    .flatMap((item) => {
      const text = clean(item.text, MAX_TEXT_LENGTH);
      return isArea(item.area) && text !== "" ? [{ area: item.area, text }] : [];
    })
    .slice(0, MAX_RECOMMENDATIONS);
  const answer = withQuestion && raw.answer ? clean(raw.answer, MAX_ANSWER_LENGTH) || null : null;
  if (summary === "" && areas.length === 0 && recommendations.length === 0 && answer === null) return null;
  return {
    summary,
    answer,
    areas,
    recommendations,
    dataGaps: raw.dataGaps.map((gap) => clean(gap, MAX_TEXT_LENGTH)).filter((gap) => gap !== "").slice(0, MAX_DATA_GAPS),
  };
}
