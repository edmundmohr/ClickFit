/**
 * Erzeugt den Cardio-Wochenplan aus den Angaben im Fragebogen. Gleiche Eingabe ergibt denselben Plan.
 */
import { WEEKDAYS, type Goal, type Weekday } from "@/domain/training/types";
import { isCardioActivityType, type CardioActivityType, type HeartRateZone, type Interval } from "./types";

export interface CardioPlanInput {
  /** Gewünschte Arten aus dem Fragebogen; `other` gilt als Crosstrainer. */
  types: readonly string[];
  sessionsPerWeek: number;
  /** Wochentage mit Krafttraining (1 = Montag … 7 = Sonntag). */
  trainingWeekdays: readonly number[];
  goal: Goal;
}

export interface PlannedCardioSession {
  weekday: Weekday;
  type: CardioActivityType;
  minutes: number;
  zone: HeartRateZone;
  intervals: Interval | null;
}

const DAYS_PER_WEEK = 7;
const FALLBACK_TYPE: CardioActivityType = "walking";
const BASE_ZONE: HeartRateZone = 2;
/** Dauer der Grundlagen-Einheit: beim Abnehmen länger, beim Aufbau kurz, damit die Erholung reicht. */
const BASE_MINUTES: Record<Goal, number> = {
  fat_loss: 45,
  recomposition: 40,
  maintain: 35,
  muscle_gain: 30,
};
/** Ab so vielen Einheiten pro Woche ist eine davon eine Intervall-Einheit. */
export const INTERVAL_SESSIONS_FROM = 3;
export const DEFAULT_INTERVAL: Interval = { workSeconds: 60, restSeconds: 90, repeats: 6 };
const INTERVAL_ZONE: HeartRateZone = 4;
/** Gehen bleibt auch in den Belastungsphasen moderat. */
const WALKING_INTERVAL_ZONE: HeartRateZone = 3;
const INTERVAL_WARM_UP_MINUTES = 10;
const INTERVAL_COOL_DOWN_MINUTES = 5;

function isWeekday(value: number): value is Weekday {
  return Number.isInteger(value) && value >= 1 && value <= DAYS_PER_WEEK;
}

/** Arten aus dem Fragebogen in planbare Arten übersetzen, ohne Dopplungen. */
export function planTypes(types: readonly string[]): CardioActivityType[] {
  const result: CardioActivityType[] = [];
  for (const raw of types) {
    const type = raw === "other" ? "cross_trainer" : raw;
    if (isCardioActivityType(type) && !result.includes(type)) result.push(type);
  }
  return result.length > 0 ? result : [FALLBACK_TYPE];
}

/** Abstände zwischen aufeinanderfolgenden Tagen, über das Wochenende hinweg gerechnet. */
function circularGaps(days: readonly number[]): number[] {
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map((day, index) => {
    const next = sorted[(index + 1) % sorted.length];
    return index === sorted.length - 1 ? next + DAYS_PER_WEEK - day : next - day;
  });
}

function subsets<T>(items: readonly T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (items.length < size) return [];
  const [first, ...rest] = items;
  return [...subsets(rest, size - 1).map((subset) => [first, ...subset]), ...subsets(rest, size)];
}

/**
 * Wählt `count` Tage aus `candidates`, sodass alle Cardio-Tage (mit den schon gesetzten `fixed`)
 * möglichst gleichmäßig über die Woche liegen. Bei Gleichstand gewinnt die frühere Kombination.
 */
function pickSpread(candidates: readonly Weekday[], count: number, fixed: readonly Weekday[]): Weekday[] {
  if (count <= 0) return [];
  if (count >= candidates.length) return [...candidates];
  let best: Weekday[] = [];
  let bestMinGap = -1;
  let bestSquares = Number.POSITIVE_INFINITY;
  for (const subset of subsets(candidates, count)) {
    const gaps = circularGaps([...fixed, ...subset]);
    const minGap = Math.min(...gaps);
    const squares = gaps.reduce((sum, gap) => sum + gap * gap, 0);
    if (minGap > bestMinGap || (minGap === bestMinGap && squares < bestSquares)) {
      best = subset;
      bestMinGap = minGap;
      bestSquares = squares;
    }
  }
  return best;
}

/** Cardio-Tage: zuerst Tage ohne Krafttraining, erst danach Trainingstage. Höchstens eine Einheit pro Tag. */
export function cardioWeekdays(sessionsPerWeek: number, trainingWeekdays: readonly number[]): Weekday[] {
  const count = Math.min(Math.max(Math.floor(sessionsPerWeek) || 0, 0), DAYS_PER_WEEK);
  const training = new Set(trainingWeekdays.filter(isWeekday));
  const free = WEEKDAYS.filter((day) => !training.has(day));
  const busy = WEEKDAYS.filter((day) => training.has(day));
  const onFree = pickSpread(free, count, []);
  const onBusy = pickSpread(busy, count - onFree.length, onFree);
  return [...onFree, ...onBusy].sort((a, b) => a - b);
}

function intervalMinutes(interval: Interval): number {
  const blockMinutes = Math.ceil(((interval.workSeconds + interval.restSeconds) * interval.repeats) / 60);
  return INTERVAL_WARM_UP_MINUTES + blockMinutes + INTERVAL_COOL_DOWN_MINUTES;
}

/** Welche Einheit die Intervalle bekommt: bevorzugt an einem Tag ohne Krafttraining und nicht beim Gehen. */
function intervalIndex(sessions: readonly PlannedCardioSession[], trainingWeekdays: readonly number[]): number | null {
  if (sessions.length < INTERVAL_SESSIONS_FROM) return null;
  let candidates = sessions.map((_, index) => index);
  const onFreeDays = candidates.filter((index) => !trainingWeekdays.includes(sessions[index].weekday));
  if (onFreeDays.length > 0) candidates = onFreeDays;
  const notWalking = candidates.filter((index) => sessions[index].type !== "walking");
  if (notWalking.length > 0) candidates = notWalking;
  return candidates[Math.floor(candidates.length / 2)];
}

export function generateCardioPlan(input: CardioPlanInput): PlannedCardioSession[] {
  const types = planTypes(input.types);
  const sessions: PlannedCardioSession[] = cardioWeekdays(input.sessionsPerWeek, input.trainingWeekdays).map(
    (weekday, index) => ({
      weekday,
      type: types[index % types.length],
      minutes: BASE_MINUTES[input.goal],
      zone: BASE_ZONE,
      intervals: null,
    }),
  );
  const hard = intervalIndex(sessions, input.trainingWeekdays);
  if (hard !== null) {
    const session = sessions[hard];
    sessions[hard] = {
      ...session,
      minutes: intervalMinutes(DEFAULT_INTERVAL),
      zone: session.type === "walking" ? WALKING_INTERVAL_ZONE : INTERVAL_ZONE,
      intervals: { ...DEFAULT_INTERVAL },
    };
  }
  return sessions;
}
