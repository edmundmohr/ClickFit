import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { dashboardSettings } from "@/db/schema";

/** Kacheln der Heute-Seite in der Standard-Reihenfolge. */
export const DASHBOARD_WIDGETS = ["training", "nutrition", "water", "streak", "week", "weight", "recovery"] as const;
export type DashboardWidget = (typeof DASHBOARD_WIDGETS)[number];

export interface WidgetSetting {
  id: DashboardWidget;
  visible: boolean;
}

function isWidget(value: string): value is DashboardWidget {
  return (DASHBOARD_WIDGETS as readonly string[]).includes(value);
}

/**
 * Bringt gespeicherte Einstellungen auf den aktuellen Stand: unbekannte Kacheln fallen weg,
 * neu hinzugekommene werden sichtbar ans Ende gehängt.
 */
export function normalizeWidgets(stored: readonly { id: string; visible: boolean }[]): WidgetSetting[] {
  const seen = new Set<DashboardWidget>();
  const result: WidgetSetting[] = [];
  for (const entry of stored) {
    if (!isWidget(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    result.push({ id: entry.id, visible: entry.visible === true });
  }
  for (const id of DASHBOARD_WIDGETS) if (!seen.has(id)) result.push({ id, visible: true });
  return result;
}

export async function getDashboardWidgets(db: AppDatabase, userId: string): Promise<WidgetSetting[]> {
  const row = await db.query.dashboardSettings.findFirst({ where: eq(dashboardSettings.userId, userId) });
  return normalizeWidgets(row?.widgets ?? []);
}

export async function saveDashboardWidgets(
  db: AppDatabase,
  userId: string,
  widgets: readonly { id: string; visible: boolean }[],
): Promise<void> {
  const normalized = normalizeWidgets(widgets);
  const updatedAt = new Date();
  await db
    .insert(dashboardSettings)
    .values({ userId, widgets: normalized, updatedAt })
    .onConflictDoUpdate({ target: dashboardSettings.userId, set: { widgets: normalized, updatedAt } });
}
