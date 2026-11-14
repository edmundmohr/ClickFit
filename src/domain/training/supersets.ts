/**
 * Supersätze und Zirkel: Übungen mit gleicher Gruppen-Kennung werden abwechselnd ausgeführt.
 * Die Pause läuft erst, wenn alle Übungen der Gruppe den Durchgang abgeschlossen haben.
 */

export interface GroupMember {
  id: string;
  groupId: string | null;
  /** Abgehakte Sätze (ohne Aufwärmsätze). */
  completedSets: number;
  /** Alle geplanten Sätze (ohne Aufwärmsätze). */
  totalSets: number;
}

export type GroupKind = "superset" | "circuit";

/** Zwei Übungen bilden einen Supersatz, drei oder mehr einen Zirkel. */
export function groupKind(size: number): GroupKind | null {
  if (size < 2) return null;
  return size === 2 ? "superset" : "circuit";
}

export interface AfterSet {
  /** Pause starten? */
  rest: boolean;
  /** Kennung der Übung, mit der es ohne Pause weitergeht. */
  nextId: string | null;
}

/**
 * Entscheidet nach einem abgehakten Satz, ob pausiert wird. `members` enthält den Stand
 * NACH dem Abhaken, in der Reihenfolge des Trainings.
 */
export function afterSetCompleted(members: readonly GroupMember[], completedId: string): AfterSet {
  const current = members.find((member) => member.id === completedId);
  if (!current || current.groupId === null) return { rest: true, nextId: null };
  const group = members.filter((member) => member.groupId === current.groupId);
  if (group.length < 2) return { rest: true, nextId: null };

  const round = current.completedSets;
  const startIndex = group.findIndex((member) => member.id === completedId);
  // Reihum ab der nächsten Übung: Wer den Durchgang noch nicht hat und noch offene Sätze besitzt, ist dran.
  for (let offset = 1; offset < group.length; offset++) {
    const candidate = group[(startIndex + offset) % group.length];
    if (candidate.completedSets < round && candidate.completedSets < candidate.totalSets) {
      return { rest: false, nextId: candidate.id };
    }
  }
  return { rest: true, nextId: null };
}

/** Pause nach einem Durchgang: die längste Pause der beteiligten Übungen. */
export function groupRestSeconds(restSeconds: readonly number[]): number {
  return restSeconds.length === 0 ? 0 : Math.max(...restSeconds);
}

export interface Grouped<T> {
  groupId: string | null;
  items: T[];
}

/**
 * Fasst aufeinanderfolgende Einträge mit gleicher Gruppen-Kennung zusammen.
 * Eine Gruppe mit nur einem Eintrag gilt als einzelne Übung.
 */
export function groupConsecutive<T extends { groupId: string | null }>(items: readonly T[]): Grouped<T>[] {
  const result: Grouped<T>[] = [];
  for (const item of items) {
    const last = result.at(-1);
    if (item.groupId !== null && last && last.groupId === item.groupId) last.items.push(item);
    else result.push({ groupId: item.groupId, items: [item] });
  }
  return result.map((group) => (group.items.length < 2 ? { groupId: null, items: group.items } : group));
}

/**
 * Bereinigt Gruppen nach dem Umsortieren: Eine Kennung bleibt nur erhalten, wenn mindestens
 * zwei benachbarte Übungen sie tragen.
 */
export function normalizeGroups<T extends { groupId: string | null }>(items: readonly T[]): T[] {
  return groupConsecutive(items).flatMap((group) =>
    group.items.map((item) => (item.groupId === group.groupId ? item : { ...item, groupId: group.groupId })),
  );
}
