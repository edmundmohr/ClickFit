/**
 * Schreibt einen geprüften Health-Import in die Datenbank und liest importierte Tageswerte.
 */
import { and, asc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import type { AppDatabase } from "@/db/client";
import { activity, bodyWeightEntry, healthMetric, userProfile } from "@/db/schema";
import { ageFromBirthYear, maxHeartRate } from "@/domain/cardio/zones";
import { estimateEffort } from "@/domain/health-import/effort";
import type { DailyValue } from "@/domain/health-import/summary";
import type { HealthImport, HealthMetricType } from "@/domain/health-import/types";
import { toLocalDate, type LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";

export type ImportSource = "api" | "csv";

export interface ImportCounts {
  weight: number;
  steps: number;
  restingHeartRate: number;
  workouts: number;
}

export interface ImportResult {
  imported: ImportCounts;
  /** Nicht übernommene Einträge, einschließlich Gewichte, die einem Eintrag von Hand weichen mussten. */
  skipped: number;
}

/**
 * D1 erlaubt höchstens 100 gebundene Parameter je Anweisung. Die Tabellen haben 6 bzw. 15 Spalten;
 * die Blockgrößen lassen Platz für die Parameter der Konfliktklausel.
 */
const WEIGHT_ROWS = 15;
const METRIC_ROWS = 15;
const ACTIVITY_ROWS = 6;
/** So viele Anweisungen gehen höchstens in einen `db.batch` (eine Transaktion). */
const BATCH_STATEMENTS = 50;

type Statement = BatchItem<"sqlite">;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

const isNonEmpty = <T>(items: T[]): items is [T, ...T[]] => items.length > 0;

/** Spalte der Zeile, die wegen des Konflikts nicht eingefügt wurde. */
const excluded = (column: string) => sql.raw(`excluded.${column}`);

function weightStatements(db: AppDatabase, userId: string, data: HealthImport, now: Date): Statement[] {
  return chunk(data.weights, WEIGHT_ROWS).map((rows) =>
    db
      .insert(bodyWeightEntry)
      .values(rows.map((row) => ({ id: newId(), userId, date: row.date, weightKg: row.kg, source: "import", createdAt: now })))
      .onConflictDoUpdate({
        target: [bodyWeightEntry.userId, bodyWeightEntry.date],
        set: { weightKg: excluded("weight_kg") },
        // Ein von Hand eingetragener Wert bleibt stehen; ein früher importierter wird ersetzt.
        setWhere: ne(bodyWeightEntry.source, "manual"),
      })
      .returning({ id: bodyWeightEntry.id }),
  );
}

function metricStatements(db: AppDatabase, userId: string, data: HealthImport, source: ImportSource, now: Date): Statement[] {
  const rows = [
    ...data.steps.map((row) => ({ type: "steps" satisfies HealthMetricType, date: row.date, value: row.count })),
    ...data.restingHeartRates.map((row) => ({ type: "resting_heart_rate" satisfies HealthMetricType, date: row.date, value: row.bpm })),
  ];
  return chunk(rows, METRIC_ROWS).map((block) =>
    db
      .insert(healthMetric)
      .values(block.map((row) => ({ ...row, userId, source, updatedAt: now })))
      .onConflictDoUpdate({
        target: [healthMetric.userId, healthMetric.type, healthMetric.date],
        set: { value: excluded("value"), source: excluded("source"), updatedAt: excluded("updated_at") },
      }),
  );
}

/**
 * Frühere Versionen kennzeichneten Einheiten ohne Uhrzeit nur nach Art und Tag. Ein so
 * gespeicherter Eintrag mit gleicher Dauer und Distanz bekommt die neue Kennung (Notiz bleibt),
 * damit ein erneuter Import derselben Datei nichts verdoppelt.
 */
function legacyIdStatements(db: AppDatabase, userId: string, data: HealthImport): Statement[] {
  return data.workouts.flatMap((row) => {
    if (!row.legacyExternalId) return [];
    const taken = sql`not exists (select 1 from ${activity} as existing where existing.user_id = ${userId} and existing.external_id = ${row.externalId})`;
    return [
      db
        .update(activity)
        .set({ externalId: row.externalId })
        .where(
          and(
            eq(activity.userId, userId),
            eq(activity.externalId, row.legacyExternalId),
            eq(activity.durationSeconds, row.durationSeconds),
            row.distanceMeters === null ? isNull(activity.distanceMeters) : eq(activity.distanceMeters, row.distanceMeters),
            taken,
          ),
        ),
    ];
  });
}

function activityStatements(db: AppDatabase, userId: string, data: HealthImport, maxBpm: number | null, now: Date): Statement[] {
  return chunk(data.workouts, ACTIVITY_ROWS).map((rows) =>
    db
      .insert(activity)
      .values(
        rows.map((row) => {
          const effort = estimateEffort(row.avgHeartRate, maxBpm);
          return {
            id: newId(),
            userId,
            date: toLocalDate(row.start),
            type: row.type,
            durationSeconds: row.durationSeconds,
            distanceMeters: row.distanceMeters,
            avgHeartRate: row.avgHeartRate,
            zone: effort.zone,
            intensity: effort.intensity,
            source: "import",
            externalId: row.externalId,
            endedAt: new Date(row.start.getTime() + row.durationSeconds * 1000),
            createdAt: now,
          };
        }),
      )
      // Dieselbe Einheit noch einmal: aktualisieren statt verdoppeln. Notiz und Kennung bleiben.
      .onConflictDoUpdate({
        target: [activity.userId, activity.externalId],
        set: {
          date: excluded("date"),
          type: excluded("type"),
          durationSeconds: excluded("duration_seconds"),
          distanceMeters: excluded("distance_meters"),
          avgHeartRate: excluded("avg_heart_rate"),
          zone: excluded("zone"),
          intensity: excluded("intensity"),
          endedAt: excluded("ended_at"),
        },
      }),
  );
}

/** Maximalpuls aus dem Profil; ohne Profil `null`. */
async function getMaxHeartRate(db: AppDatabase, userId: string, now: Date): Promise<number | null> {
  const profile = await db.query.userProfile.findFirst({ columns: { birthYear: true }, where: eq(userProfile.userId, userId) });
  if (!profile) return null;
  return maxHeartRate(ageFromBirthYear(profile.birthYear, Number(toLocalDate(now).slice(0, 4))));
}

/**
 * Übernimmt die Werte eines Imports für den Nutzer. Wiederholte Importe sind unschädlich:
 * Tageswerte werden ersetzt, Einheiten anhand ihrer Kennung aktualisiert.
 */
export async function applyHealthImport(
  db: AppDatabase,
  userId: string,
  data: HealthImport,
  source: ImportSource,
  now = new Date(),
): Promise<ImportResult> {
  const maxBpm = data.workouts.length > 0 ? await getMaxHeartRate(db, userId, now) : null;
  const weights = weightStatements(db, userId, data, now);
  const statements = [
    ...weights,
    ...metricStatements(db, userId, data, source, now),
    ...legacyIdStatements(db, userId, data),
    ...activityStatements(db, userId, data, maxBpm, now),
  ];

  const results: unknown[] = [];
  for (const block of chunk(statements, BATCH_STATEMENTS)) {
    if (isNonEmpty(block)) results.push(...(await db.batch(block)));
  }
  // Die Gewichts-Anweisungen stehen vorn und geben die tatsächlich geschriebenen Zeilen zurück.
  const writtenWeights = results.slice(0, weights.length).reduce<number>((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0);

  return {
    imported: {
      weight: writtenWeights,
      steps: data.steps.length,
      restingHeartRate: data.restingHeartRates.length,
      workouts: data.workouts.length,
    },
    skipped: data.skipped + (data.weights.length - writtenWeights),
  };
}

/** Importierte Tageswerte einer Art im Zeitraum (beide Tage eingeschlossen), älteste zuerst. */
export async function getHealthMetrics(
  db: AppDatabase,
  userId: string,
  type: HealthMetricType,
  from: LocalDate,
  to: LocalDate,
): Promise<DailyValue[]> {
  return db
    .select({ date: healthMetric.date, value: healthMetric.value })
    .from(healthMetric)
    .where(and(eq(healthMetric.userId, userId), eq(healthMetric.type, type), gte(healthMetric.date, from), lte(healthMetric.date, to)))
    .orderBy(asc(healthMetric.date));
}
