/**
 * Ordnet Workout-Namen aus Health-Apps (englisch oder deutsch) einer Sportart der App zu.
 */
import { isActivityType, type ActivityType } from "@/domain/cardio/types";

/**
 * Krafttraining wird nicht importiert: Es wird in der App selbst geloggt und ginge sonst
 * doppelt in die Erholung ein.
 */
export const STRENGTH = "strength";
export type WorkoutKind = ActivityType | typeof STRENGTH;

/** Reihenfolge zählt: Die erste passende Regel gewinnt (z. B. „Stair Climbing“ vor „Climbing“). */
const RULES: readonly (readonly [RegExp, WorkoutKind])[] = [
  [/strength|kraft|weight ?lift|weight training|gewichtheben|bodybuilding/, STRENGTH],
  [/stair|treppe|hand ?cycl|handbike/, "other"],
  [/ski|snowboard|langlauf/, "skiing"],
  [/box|martial|kampf|karate|judo|taekwondo|wrestling|jiu|kung ?fu|\bringen/, "martial_arts"],
  [/tennis|badminton|squash|padel|pickleball|racquet|racket|schläger/, "racket_sport"],
  [/american football|australian football|rugby/, "team_sport"],
  [/soccer|football|fußball|fussball/, "football"],
  [/basketball|volleyball|handball|hockey|baseball|softball|lacrosse|cricket|mannschaft|\bteam/, "team_sport"],
  [/climb|kletter|boulder/, "climbing"],
  [/swim|schwimm/, "swimming"],
  [/\brow|\bruder/, "rowing"],
  [/elliptical|cross ?trainer|ellipsen/, "cross_trainer"],
  [/hik|wander/, "hiking"],
  [/cycl|bik|\brad|spinning/, "cycling"],
  [/\brun|jog|\blauf/, "running"],
  [/walk|\bgehen|spazier/, "walking"],
  [/yoga/, "yoga"],
  [/danc|tanz|zumba/, "dancing"],
];

/** Sportart zu einem Namen wie „Outdoor Run“, „Laufen“ oder `running`; Unbekanntes wird `other`. */
export function mapWorkoutName(name: string): WorkoutKind {
  const raw = name.trim().toLowerCase();
  if (isActivityType(raw)) return raw;
  const normalized = raw.replace(/[_\-/]+/g, " ").replace(/\s+/g, " ");
  const key = normalized.replaceAll(" ", "_");
  if (isActivityType(key)) return key;
  for (const [pattern, kind] of RULES) {
    if (pattern.test(normalized)) return kind;
  }
  return "other";
}
