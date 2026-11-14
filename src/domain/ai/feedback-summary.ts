/**
 * Rückmeldungen nach Übungen (Anstrengung und RIR) als kurze Zusammenfassung für die KI.
 * Pro Übung eine Zeile, neueste Angaben zuerst. Reine Funktion ohne Framework.
 */
import { MAX_FEEDBACK_RIR, type EffortLevel } from "@/domain/training/types";
import type { LocalDate } from "@/lib/dates";

/** So weit zurück zählen Rückmeldungen. */
export const FEEDBACK_LOOKBACK_DAYS = 28;
/** Höchstens so viele Angaben je Übung … */
const MAX_ENTRIES_PER_EXERCISE = 4;
/** … und höchstens so viele Übungen, damit die Anfrage klein bleibt. */
const MAX_EXERCISES = 30;

const EFFORT_WORDS: Record<EffortLevel, string> = {
  easy: "leicht",
  right: "passend",
  hard: "schwer",
  max: "am Limit",
};

export interface FeedbackEntry {
  exerciseId: string;
  name: string;
  date: LocalDate;
  effort: EffortLevel | null;
  rir: number | null;
}

function describe(entry: FeedbackEntry): string {
  const parts = [
    entry.effort ? EFFORT_WORDS[entry.effort] : null,
    entry.rir === null ? null : `RIR ${entry.rir >= MAX_FEEDBACK_RIR ? `${MAX_FEEDBACK_RIR}+` : entry.rir}`,
  ].filter((part): part is string => part !== null);
  return `${entry.date} ${parts.join(", ")}`;
}

/**
 * Eine Zeile je Übung: `kennung | Name: 2026-11-12 schwer, RIR 1; 2026-11-05 passend`.
 * Einträge ohne Angabe fallen weg. Übungen mit der jüngsten Rückmeldung stehen oben.
 */
export function summarizeFeedback(entries: readonly FeedbackEntry[]): string[] {
  const byExercise = new Map<string, FeedbackEntry[]>();
  const sorted = entries
    .filter((entry) => entry.effort !== null || entry.rir !== null)
    .sort((a, b) => b.date.localeCompare(a.date) || a.exerciseId.localeCompare(b.exerciseId));
  for (const entry of sorted) {
    const list = byExercise.get(entry.exerciseId) ?? [];
    if (list.length < MAX_ENTRIES_PER_EXERCISE) list.push(entry);
    byExercise.set(entry.exerciseId, list);
  }
  return [...byExercise.values()]
    .slice(0, MAX_EXERCISES)
    .map((list) => `${list[0].exerciseId} | ${list[0].name}: ${list.map(describe).join("; ")}`);
}
