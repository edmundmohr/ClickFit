/**
 * Zyklusangepasstes Training (optional): schätzt die Zyklusphase aus dem letzten Periodenbeginn
 * und der üblichen Zykluslänge und leitet daraus eine Empfehlung ab. Reine Schätzung nach Kalender.
 */
import { diffDays, type LocalDate } from "@/lib/dates";

export const CYCLE_PHASES = ["menstruation", "follicular", "ovulation", "luteal", "late_luteal"] as const;
export type CyclePhase = (typeof CYCLE_PHASES)[number];

export const MIN_CYCLE_LENGTH = 21;
export const MAX_CYCLE_LENGTH = 40;
const MENSTRUATION_DAYS = 5;
const LUTEAL_DAYS = 14;
const LATE_LUTEAL_DAYS = 5;

export interface CycleStatus {
  /** Zyklustag, 1 = erster Tag der Periode. */
  day: number;
  phase: CyclePhase;
  /** Vorschlag für das Ziel-RIR: 1 = einen Satz weniger hart, 0 = normal. */
  rirOffset: number;
  /** In ruhigeren Phasen wird das Gewicht gehalten statt gesteigert. */
  holdProgression: boolean;
}

export function cycleStatus(lastStart: LocalDate, lengthDays: number, today: LocalDate): CycleStatus | null {
  const length = Math.min(Math.max(Math.round(lengthDays), MIN_CYCLE_LENGTH), MAX_CYCLE_LENGTH);
  const elapsed = diffDays(lastStart, today);
  if (elapsed < 0) return null;
  const day = (elapsed % length) + 1;
  const ovulationDay = length - LUTEAL_DAYS;

  let phase: CyclePhase;
  if (day <= MENSTRUATION_DAYS) phase = "menstruation";
  else if (day < ovulationDay - 1) phase = "follicular";
  else if (day <= ovulationDay + 1) phase = "ovulation";
  else if (day > length - LATE_LUTEAL_DAYS) phase = "late_luteal";
  else phase = "luteal";

  const easier = phase === "menstruation" || phase === "late_luteal";
  return { day, phase, rirOffset: easier ? 1 : 0, holdProgression: easier };
}
