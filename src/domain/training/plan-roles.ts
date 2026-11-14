/**
 * Rollen von Trainingsplänen: genau ein Hauptplan, beliebig viele Zusatzpläne, inaktive und
 * archivierte Pläne. Haupt- und Zusatzpläne sind „eingeplant“: Ihre Routinen mit festem
 * Wochentag erscheinen auf der Heute-Seite, im Kalender und zählen für die Serie.
 */
import type { Weekday } from "./types";

/** Gespeicherte Werte der Spalte `training_plan.status`. */
export const PLAN_STATUSES = ["active", "extra", "saved", "archived"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

/** Status, deren Routinen in den Wochenablauf eingeplant sind. */
export const SCHEDULED_STATUSES: readonly PlanStatus[] = ["active", "extra"];

export function isScheduled(status: PlanStatus): boolean {
  return SCHEDULED_STATUSES.includes(status);
}

export type StatusChange =
  | {
      ok: true;
      /** Der bisherige Hauptplan wird inaktiv. */
      demoteMain: boolean;
      /** Der Plan beginnt heute (Basis für Kalender und Deload-Wochen). */
      restart: boolean;
    }
  | { ok: false; error: "PLAN_ACTIVE" };

/**
 * Prüft einen Rollenwechsel. Der Hauptplan lässt sich nicht direkt abwählen: Erst ein anderer
 * Plan wird Hauptplan, dann ist der bisherige frei. Ein Plan, der neu eingeplant wird, beginnt
 * am Tag des Wechsels; sonst gälten Tage seit dem Anlegen im Kalender rückwirkend als verpasst.
 * Wechselt ein Plan nur zwischen Haupt- und Zusatzplan, läuft er weiter.
 */
export function planStatusChange(current: PlanStatus, target: PlanStatus): StatusChange {
  if (current === target) return { ok: true, demoteMain: false, restart: false };
  if (current === "active") return { ok: false, error: "PLAN_ACTIVE" };
  return { ok: true, demoteMain: target === "active", restart: isScheduled(target) && !isScheduled(current) };
}

export interface ScheduledPlan<D extends { id: string; weekday: Weekday | null }> {
  id: string;
  status: PlanStatus;
  days: readonly D[];
}

/** Hauptplan zuerst, danach die Zusatzpläne in ihrer Reihenfolge; nicht eingeplante fallen weg. */
function scheduledInOrder<D extends { id: string; weekday: Weekday | null }>(
  plans: readonly ScheduledPlan<D>[],
): ScheduledPlan<D>[] {
  return [...plans.filter((plan) => plan.status === "active"), ...plans.filter((plan) => plan.status === "extra")];
}

/** Alle festen Trainingstage aus Haupt- und Zusatzplänen, jeder Tag einmal, aufsteigend. */
export function scheduledWeekdays(plans: readonly ScheduledPlan<{ id: string; weekday: Weekday | null }>[]): Weekday[] {
  const days = scheduledInOrder(plans).flatMap((plan) => plan.days);
  return [...new Set(days.flatMap((day) => (day.weekday === null ? [] : [day.weekday])))].sort((a, b) => a - b);
}

export interface TodayUnit<D, S> {
  planId: string;
  day: D;
  /** Die heute abgeschlossene Einheit dieser Routine; `null` = noch offen. */
  done: S | null;
}

export interface TodayOverview<D, S> {
  units: TodayUnit<D, S>[];
  /** Heute abgeschlossene Einheiten, die keine der geplanten Routinen sind (spontan gestartet). */
  unplanned: S[];
}

/**
 * Die Einheiten des Tages aus Haupt- und Zusatzplänen. Jede abgeschlossene Einheit hakt höchstens
 * eine geplante Routine ab (dieselbe Routine zweimal am Tag zählt doppelt nur, wenn sie doppelt
 * geplant ist). Erwartet die Einheiten des Tages in zeitlicher Reihenfolge.
 */
export function todayOverview<D extends { id: string; weekday: Weekday | null }, S extends { planDayId: string | null }>(
  plans: readonly ScheduledPlan<D>[],
  weekday: Weekday,
  sessions: readonly S[],
): TodayOverview<D, S> {
  const remaining = [...sessions];
  const units = scheduledInOrder(plans).flatMap((plan) =>
    plan.days
      .filter((day) => day.weekday === weekday)
      .map((day) => {
        const index = remaining.findIndex((session) => session.planDayId === day.id);
        const done = index === -1 ? null : (remaining.splice(index, 1)[0] ?? null);
        return { planId: plan.id, day, done };
      }),
  );
  return { units, unplanned: remaining };
}

/** Nächster eingeplanter Trainingstag nach heute (innerhalb der kommenden Woche). */
export function nextScheduledDay<D extends { id: string; weekday: Weekday | null }>(
  plans: readonly ScheduledPlan<D>[],
  todayWeekday: Weekday,
): D | null {
  const days = scheduledInOrder(plans).flatMap((plan) => plan.days);
  for (let offset = 1; offset <= 7; offset++) {
    const weekday = ((todayWeekday - 1 + offset) % 7) + 1;
    const match = days.find((day) => day.weekday === weekday);
    if (match) return match;
  }
  return null;
}

/**
 * Der Ort, an dem eine Routine trainiert wird: der feste Ort ihres Plans, sonst der Ort des Tages
 * (aktiver Ort bzw. im Reise-Urlaub der Reiseort). Ein gelöschter fester Ort fällt zurück.
 */
export function resolvePlanGym<G extends { id: string }>(
  planGymId: string | null,
  gyms: readonly G[],
  fallback: G | null,
): G | null {
  if (planGymId === null) return fallback;
  return gyms.find((gym) => gym.id === planGymId) ?? fallback;
}
