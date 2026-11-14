/**
 * Geloggte Cardio-Einheiten und Zusatzsport.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { activity } from "@/db/schema";
import { activityLoads } from "@/domain/cardio/load";
import { isActivityType, isHeartRateZone, isIntensity, type Activity } from "@/domain/cardio/types";
import type { ExtraLoad } from "@/domain/progress/recovery";
import { addDays, startOfWeek, toLocalDate, type LocalDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/tokens";
import type { ActivityInput } from "../schemas";

type ActivityRow = typeof activity.$inferSelect;

function toActivity(row: ActivityRow): Activity {
  return {
    id: row.id,
    date: row.date,
    type: isActivityType(row.type) ? row.type : "other",
    durationSeconds: row.durationSeconds,
    distanceMeters: row.distanceMeters,
    avgHeartRate: row.avgHeartRate,
    zone: isHeartRateZone(row.zone) ? row.zone : null,
    intensity: isIntensity(row.intensity) ? row.intensity : "moderate",
    intervals: row.intervals,
    note: row.note,
    endedAt: row.endedAt,
  };
}

/**
 * Ende der Einheit, ab dem die Ermüdung abklingt: bei einem Eintrag für heute der Zeitpunkt
 * des Eintragens, bei einem nachgetragenen Tag dessen Mittag.
 */
function endOfActivity(date: LocalDate, now: Date): Date {
  return date === toLocalDate(now) ? now : new Date(`${date}T12:00:00Z`);
}

/** Trägt eine Einheit ein und gibt ihre Kennung zurück. Tage in der Zukunft sind nicht erlaubt. */
export async function logActivity(db: AppDatabase, userId: string, input: ActivityInput, now = new Date()): Promise<string> {
  if (input.date > toLocalDate(now)) throw new AppError("VALIDATION");
  const id = newId();
  await db.insert(activity).values({
    id,
    userId,
    date: input.date,
    type: input.type,
    durationSeconds: input.durationSeconds,
    distanceMeters: input.distanceMeters,
    avgHeartRate: input.avgHeartRate,
    zone: input.zone,
    intensity: input.intensity,
    intervals: input.intervals,
    note: input.note || null,
    source: "manual",
    endedAt: endOfActivity(input.date, now),
    createdAt: now,
  });
  return id;
}

export async function deleteActivity(db: AppDatabase, userId: string, activityId: string): Promise<void> {
  const deleted = await db
    .delete(activity)
    .where(and(eq(activity.id, activityId), eq(activity.userId, userId)))
    .returning({ id: activity.id });
  if (deleted.length === 0) throw new AppError("NOT_FOUND");
}

/** Einheiten des Zeitraums (beide Tage eingeschlossen), neueste zuerst. */
export async function listActivities(db: AppDatabase, userId: string, from: LocalDate, to: LocalDate): Promise<Activity[]> {
  const rows = await db.query.activity.findMany({
    where: and(eq(activity.userId, userId), gte(activity.date, from), lte(activity.date, to)),
    orderBy: [desc(activity.date), desc(activity.endedAt), desc(activity.createdAt)],
  });
  return rows.map(toActivity);
}

export interface WeekSummary {
  /** Montag und Sonntag der Woche. */
  from: LocalDate;
  to: LocalDate;
  sessions: number;
  durationSeconds: number;
  distanceMeters: number;
}

/** Summen der Woche (Montag bis Sonntag), in der `date` liegt. */
export async function getWeekSummary(db: AppDatabase, userId: string, date: LocalDate): Promise<WeekSummary> {
  const from = startOfWeek(date);
  const to = addDays(from, 6);
  const [row] = await db
    .select({
      sessions: sql<number>`count(*)`,
      durationSeconds: sql<number>`coalesce(sum(${activity.durationSeconds}), 0)`,
      distanceMeters: sql<number>`coalesce(sum(${activity.distanceMeters}), 0)`,
    })
    .from(activity)
    .where(and(eq(activity.userId, userId), gte(activity.date, from), lte(activity.date, to)));
  return {
    from,
    to,
    sessions: row?.sessions ?? 0,
    durationSeconds: row?.durationSeconds ?? 0,
    distanceMeters: row?.distanceMeters ?? 0,
  };
}

/** Belastungen aus Cardio und Zusatzsport seit `since`, als Eingabe für die Erholung. */
export async function getActivityLoads(db: AppDatabase, userId: string, since: Date): Promise<ExtraLoad[]> {
  const rows = await db.query.activity.findMany({
    where: and(eq(activity.userId, userId), gte(activity.endedAt, since)),
  });
  return rows.flatMap((row) => activityLoads(toActivity(row)));
}
