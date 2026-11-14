/**
 * Beginn und Dauer einer importierten Einheit aus den Angaben der Quelle bestimmen.
 */
import { momentOf, parseMoment, type Moment } from "./timestamps";
import type { EntryIssue } from "./types";

export interface TimingInput {
  /** `undefined` = nicht angegeben; alles andere muss eine gültige Zeitangabe sein. */
  start: unknown;
  end: unknown;
  /** Dauer aus der Quelle in Sekunden, falls angegeben. */
  durationSeconds: number | null;
}

export type Timing = { ok: true; start: Moment; durationSeconds: number } | { ok: false; issue: EntryIssue };

const given = (value: unknown) => value !== undefined && value !== null && value !== "";

/**
 * Die Dauer der Quelle hat Vorrang vor der Spanne zwischen Beginn und Ende (Pausen zählen nicht).
 * Fehlt der Beginn, ergibt er sich aus Ende und Dauer; fehlt auch das Ende, endete die Einheit jetzt.
 */
export function resolveTiming(input: TimingInput, now: Date): Timing {
  const start = given(input.start) ? parseMoment(input.start) : null;
  const end = given(input.end) ? parseMoment(input.end) : null;
  if ((given(input.start) && !start) || (given(input.end) && !end)) return { ok: false, issue: "date" };

  const span = start && end ? (end.instant.getTime() - start.instant.getTime()) / 1000 : null;
  const durationSeconds = input.durationSeconds ?? span;
  if (durationSeconds === null || !Number.isFinite(durationSeconds)) return { ok: false, issue: "value" };
  if (start) return { ok: true, start, durationSeconds };

  const endInstant = end?.instant ?? now;
  return { ok: true, start: momentOf(new Date(endInstant.getTime() - durationSeconds * 1000)), durationSeconds };
}
