import type { DayFocus, Split, Weekday } from "@/domain/training/types";

/**
 * Anzeigename einer Routine bzw. eines Trainings: eigener Name, sonst der Fokus des erzeugten
 * Tags, sonst „Freies Training“. Der Aufrufer liefert die Übersetzung des Fokus.
 */
export function routineTitle(
  item: { name: string | null; focus: DayFocus | null },
  focusLabel: (focus: DayFocus | "free") => string,
): string {
  return item.name ?? focusLabel(item.focus ?? "free");
}

/** Anzeigename eines Ordners: eigener Name, sonst der Split des erzeugten Plans. */
export function folderTitle(
  folder: { name: string | null; split: Split | null },
  splitLabel: (split: Split | "custom") => string,
): string {
  return folder.name ?? splitLabel(folder.split ?? "custom");
}

/** Die festen Trainingstage eines Plans (ohne Routinen ohne Wochentag), jeder Tag einmal. */
export function plannedWeekdays(days: readonly { weekday: Weekday | null }[]): Weekday[] {
  return [...new Set(days.flatMap((day) => (day.weekday === null ? [] : [day.weekday])))].sort((a, b) => a - b);
}
