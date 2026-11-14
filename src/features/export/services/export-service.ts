/**
 * Baut aus den Daten eines Nutzers die Export-Dokumente (Training, Gewicht, Ernährung).
 * Jede Abfrage ist auf den Nutzer und den Zeitraum eingegrenzt; beide Grenzen zählen mit.
 * Alle sichtbaren Texte kommen als `ExportLabels` herein, damit der Dienst ohne next-intl
 * auskommt und sich gegen die Datenbank testen lässt.
 */
import { and, asc, eq, gte, isNotNull, lte } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { foodLogEntry, workoutExercise, workoutSession, workoutSet } from "@/db/schema";
import type { ActivityType, Intensity } from "@/domain/cardio/types";
import { formatGermanDate } from "@/domain/export/format";
import type { ExportColumn, ExportDocument, ExportRow, ExportTable } from "@/domain/export/types";
import { weightTrend } from "@/domain/nutrition/adaptive";
import { AMOUNT_UNITS, MEALS, isMeal, type AmountUnit, type Meal } from "@/domain/nutrition/types";
import { isAssisted, sessionTotals, type LoggedSet } from "@/domain/training/records";
import { DAY_FOCUSES, SET_TYPES, isOneOf, type DayFocus, type SetType } from "@/domain/training/types";
import { listActivities } from "@/features/cardio/services/activity-service";
import { getWeights } from "@/features/nutrition/services/tracking-service";
import { getUserCatalog } from "@/features/training/services/exercise-service";
import { routineTitle } from "@/features/training/titles";
import type { LocalDate } from "@/lib/dates";
import { toDisplayWeight, type UnitSystem } from "@/lib/units";
import type { ExportDataset, ExportRange } from "../datasets";

/** Überschriften der Spalten. Einheiten (kg oder lbs) stehen schon fertig im Text. */
export interface ExportColumnLabels {
  date: string;
  workout: string;
  exercise: string;
  setNumber: string;
  setType: string;
  weight: string;
  reps: string;
  seconds: string;
  rir: string;
  note: string;
  durationMinutes: string;
  sets: string;
  volume: string;
  activityType: string;
  distanceKm: string;
  heartRate: string;
  zone: string;
  intensity: string;
  bodyWeight: string;
  trend: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  meal: string;
  food: string;
  amount: string;
  unit: string;
}

export interface ExportLabels {
  /** Titel des Dokuments je Datensatz. */
  titles: Record<ExportDataset, string>;
  /** Zeitraum als Text; die Tage kommen schon als TT.MM.JJJJ an, `from` fehlt bei „alles“. */
  period: (from: string | null, to: string) => string;
  tables: { sets: string; sessions: string; activities: string; weight: string; days: string; entries: string };
  columns: ExportColumnLabels;
  focus: (focus: DayFocus | "free") => string;
  setTypes: Record<SetType, string>;
  activityTypes: Record<ActivityType, string>;
  intensities: Record<Intensity, string>;
  meals: Record<Meal, string>;
  amountUnits: Record<AmountUnit, string>;
  /** Für Übungen, die es weder in der Bibliothek noch unter den eigenen gibt. */
  unknownExercise: string;
}

export interface ExportUser {
  id: string;
  unitSystem: UnitSystem;
}

/** Vor diesem Tag gibt es keine Daten: untere Grenze für Dienste, die ein `from` verlangen. */
const FIRST_DATE: LocalDate = "0000-01-01";

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Nachkommastellen eines Gewichts in der Einheit des Nutzers (wie `toDisplayWeight` rundet). */
function weightDecimals(unitSystem: UnitSystem): number {
  return unitSystem === "imperial" ? 1 : 2;
}

function subtitle(range: ExportRange, labels: ExportLabels): string {
  const from = range.from ? (formatGermanDate(range.from) ?? range.from) : null;
  return labels.period(from, formatGermanDate(range.to) ?? range.to);
}

function column(key: string, label: string, type: ExportColumn["type"], decimals?: number): ExportColumn {
  return decimals === undefined ? { key, label, type } : { key, label, type, decimals };
}

/**
 * Training: Sätze und Einheiten aus abgeschlossenen Workouts sowie Cardio und Zusatzsport.
 * Aufwärmsätze stehen in der Satztabelle, zählen aber wie in der App nicht zu Sätzen und Volumen.
 */
export async function buildTrainingExport(
  db: AppDatabase,
  user: ExportUser,
  range: ExportRange,
  labels: ExportLabels,
): Promise<ExportDocument> {
  const sessionFilter = and(
    eq(workoutSession.userId, user.id),
    eq(workoutSession.status, "completed"),
    range.from ? gte(workoutSession.date, range.from) : undefined,
    lte(workoutSession.date, range.to),
  );
  // Sätze kommen über einen Join statt über `inArray`: D1 erlaubt nur 100 gebundene Parameter.
  const [sessions, setRows, catalog, activities] = await Promise.all([
    db
      .select({
        id: workoutSession.id,
        date: workoutSession.date,
        name: workoutSession.name,
        focus: workoutSession.focus,
        startedAt: workoutSession.startedAt,
        finishedAt: workoutSession.finishedAt,
      })
      .from(workoutSession)
      .where(sessionFilter)
      .orderBy(asc(workoutSession.date), asc(workoutSession.startedAt), asc(workoutSession.id)),
    db
      .select({
        sessionId: workoutExercise.sessionId,
        workoutExerciseId: workoutExercise.id,
        exerciseId: workoutExercise.exerciseId,
        type: workoutSet.type,
        weightKg: workoutSet.weightKg,
        reps: workoutSet.reps,
        rir: workoutSet.rir,
        durationSeconds: workoutSet.durationSeconds,
        note: workoutSet.note,
      })
      .from(workoutSet)
      .innerJoin(workoutExercise, eq(workoutSet.workoutExerciseId, workoutExercise.id))
      .innerJoin(workoutSession, eq(workoutExercise.sessionId, workoutSession.id))
      .where(and(sessionFilter, isNotNull(workoutSet.completedAt)))
      .orderBy(
        asc(workoutSession.date),
        asc(workoutSession.startedAt),
        asc(workoutSession.id),
        asc(workoutExercise.position),
        asc(workoutExercise.id),
        asc(workoutSet.position),
      ),
    getUserCatalog(db, user.id),
    listActivities(db, user.id, range.from ?? FIRST_DATE, range.to),
  ]);

  const unit = user.unitSystem;
  const titles = new Map(
    sessions.map((session) => [
      session.id,
      routineTitle({ name: session.name, focus: isOneOf(DAY_FOCUSES, session.focus) ? session.focus : null }, labels.focus),
    ]),
  );
  const dates = new Map(sessions.map((session) => [session.id, session.date]));

  const setsBySession = new Map<string, LoggedSet[]>();
  const setNumbers = new Map<string, number>();
  const setTableRows: ExportRow[] = setRows.map((row) => {
    const type: SetType = isOneOf(SET_TYPES, row.type) ? row.type : "work";
    const exercise = catalog.find(row.exerciseId);
    const logged = setsBySession.get(row.sessionId) ?? [];
    // Unterstützung (z. B. Klimmzug-Maschine) ist keine bewegte Last und zählt nicht zum Volumen.
    logged.push({ type, weightKg: row.weightKg, reps: row.reps, completed: true, assisted: isAssisted(exercise?.type) });
    setsBySession.set(row.sessionId, logged);
    const number = (setNumbers.get(row.workoutExerciseId) ?? 0) + 1;
    setNumbers.set(row.workoutExerciseId, number);

    // Bei Halteübungen steht die Dauer in `reps`; `durationSeconds` hat Vorrang, falls gesetzt.
    const timed = exercise?.type === "duration";
    return {
      date: dates.get(row.sessionId) ?? null,
      workout: titles.get(row.sessionId) ?? null,
      exercise: exercise?.name ?? labels.unknownExercise,
      setNumber: number,
      setType: labels.setTypes[type],
      weight: row.weightKg === null ? null : toDisplayWeight(row.weightKg, unit),
      reps: timed ? null : row.reps,
      seconds: row.durationSeconds ?? (timed ? row.reps : null),
      rir: row.rir,
      note: row.note,
    };
  });

  const sessionTableRows: ExportRow[] = sessions.map((session) => {
    const totals = sessionTotals(setsBySession.get(session.id) ?? []);
    return {
      date: session.date,
      workout: titles.get(session.id) ?? null,
      durationMinutes: session.finishedAt
        ? Math.max(1, Math.round((session.finishedAt.getTime() - session.startedAt.getTime()) / 60000))
        : null,
      sets: totals.completedSets,
      volume: toDisplayWeight(totals.volumeKg, unit),
    };
  });

  // `listActivities` liefert die neuesten zuerst; im Export steht alles zeitlich aufsteigend.
  const activityTableRows: ExportRow[] = [...activities].reverse().map((activity) => ({
    date: activity.date,
    activityType: labels.activityTypes[activity.type],
    durationMinutes: round(activity.durationSeconds / 60, 1),
    distanceKm: activity.distanceMeters === null ? null : round(activity.distanceMeters / 1000, 2),
    heartRate: activity.avgHeartRate,
    zone: activity.zone,
    intensity: labels.intensities[activity.intensity],
    note: activity.note,
  }));

  const c = labels.columns;
  const decimals = weightDecimals(unit);
  const tables: ExportTable[] = [
    {
      key: "sets",
      name: labels.tables.sets,
      columns: [
        column("date", c.date, "date"),
        column("workout", c.workout, "text"),
        column("exercise", c.exercise, "text"),
        column("setNumber", c.setNumber, "number", 0),
        column("setType", c.setType, "text"),
        column("weight", c.weight, "number", decimals),
        column("reps", c.reps, "number", 0),
        column("seconds", c.seconds, "number", 0),
        column("rir", c.rir, "number", 0),
        column("note", c.note, "text"),
      ],
      rows: setTableRows,
    },
    {
      key: "sessions",
      name: labels.tables.sessions,
      columns: [
        column("date", c.date, "date"),
        column("workout", c.workout, "text"),
        column("durationMinutes", c.durationMinutes, "number", 0),
        column("sets", c.sets, "number", 0),
        column("volume", c.volume, "number", decimals),
      ],
      rows: sessionTableRows,
    },
    {
      key: "activities",
      name: labels.tables.activities,
      columns: [
        column("date", c.date, "date"),
        column("activityType", c.activityType, "text"),
        column("durationMinutes", c.durationMinutes, "number", 1),
        column("distanceKm", c.distanceKm, "number", 2),
        column("heartRate", c.heartRate, "number", 0),
        column("zone", c.zone, "number", 0),
        column("intensity", c.intensity, "text"),
        column("note", c.note, "text"),
      ],
      rows: activityTableRows,
    },
  ];
  return { title: labels.titles.training, subtitle: subtitle(range, labels), tables };
}

/**
 * Gewicht mit geglättetem Trend. Der Trend wird über alle Messungen bis zum Ende des Zeitraums
 * gerechnet und erst danach beschnitten: So stimmt er mit der Anzeige in der App überein und
 * hängt nicht davon ab, wo der Export beginnt.
 */
export async function buildWeightExport(
  db: AppDatabase,
  user: ExportUser,
  range: ExportRange,
  labels: ExportLabels,
): Promise<ExportDocument> {
  const trend = weightTrend(await getWeights(db, user.id, FIRST_DATE, range.to));
  const from = range.from;
  const rows: ExportRow[] = trend
    .filter((point) => from === null || point.date >= from)
    .map((point) => ({
      date: point.date,
      bodyWeight: toDisplayWeight(point.weightKg, user.unitSystem),
      trend: toDisplayWeight(point.trendKg, user.unitSystem),
    }));
  const decimals = weightDecimals(user.unitSystem);
  return {
    title: labels.titles.weight,
    subtitle: subtitle(range, labels),
    tables: [
      {
        key: "weight",
        name: labels.tables.weight,
        columns: [
          column("date", labels.columns.date, "date"),
          column("bodyWeight", labels.columns.bodyWeight, "number", decimals),
          column("trend", labels.columns.trend, "number", decimals),
        ],
        rows,
      },
    ],
  };
}

/** Ernährung: Summen je Tag und alle Tagebuch-Einträge mit ihren gespeicherten Nährwerten. */
export async function buildNutritionExport(
  db: AppDatabase,
  user: ExportUser,
  range: ExportRange,
  labels: ExportLabels,
): Promise<ExportDocument> {
  const entries = await db
    .select({
      date: foodLogEntry.date,
      meal: foodLogEntry.meal,
      name: foodLogEntry.name,
      amount: foodLogEntry.amount,
      amountUnit: foodLogEntry.amountUnit,
      kcal: foodLogEntry.kcal,
      proteinG: foodLogEntry.proteinG,
      carbsG: foodLogEntry.carbsG,
      fatG: foodLogEntry.fatG,
    })
    .from(foodLogEntry)
    .where(
      and(
        eq(foodLogEntry.userId, user.id),
        range.from ? gte(foodLogEntry.date, range.from) : undefined,
        lte(foodLogEntry.date, range.to),
      ),
    )
    .orderBy(asc(foodLogEntry.date), asc(foodLogEntry.createdAt), asc(foodLogEntry.id));

  // Innerhalb eines Tages in der Reihenfolge der Mahlzeiten; die Sortierung ist stabil.
  const mealOrder = (meal: string) => (isMeal(meal) ? MEALS.indexOf(meal) : MEALS.length);
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || mealOrder(a.meal) - mealOrder(b.meal));

  const days = new Map<LocalDate, { kcal: number; protein: number; carbs: number; fat: number }>();
  const entryRows: ExportRow[] = sorted.map((entry) => {
    const day = days.get(entry.date) ?? { kcal: 0, protein: 0, carbs: 0, fat: 0 };
    day.kcal += entry.kcal;
    day.protein += entry.proteinG;
    day.carbs += entry.carbsG;
    day.fat += entry.fatG;
    days.set(entry.date, day);
    return {
      date: entry.date,
      meal: isMeal(entry.meal) ? labels.meals[entry.meal] : entry.meal,
      food: entry.name,
      amount: round(entry.amount, 2),
      unit: isOneOf(AMOUNT_UNITS, entry.amountUnit) ? labels.amountUnits[entry.amountUnit] : entry.amountUnit,
      kcal: round(entry.kcal, 1),
      protein: round(entry.proteinG, 1),
      carbs: round(entry.carbsG, 1),
      fat: round(entry.fatG, 1),
    };
  });
  const dayRows: ExportRow[] = [...days].map(([date, day]) => ({
    date,
    kcal: round(day.kcal, 1),
    protein: round(day.protein, 1),
    carbs: round(day.carbs, 1),
    fat: round(day.fat, 1),
  }));

  const c = labels.columns;
  const macros = [
    column("kcal", c.kcal, "number", 0),
    column("protein", c.protein, "number", 1),
    column("carbs", c.carbs, "number", 1),
    column("fat", c.fat, "number", 1),
  ];
  return {
    title: labels.titles.nutrition,
    subtitle: subtitle(range, labels),
    tables: [
      { key: "days", name: labels.tables.days, columns: [column("date", c.date, "date"), ...macros], rows: dayRows },
      {
        key: "entries",
        name: labels.tables.entries,
        columns: [
          column("date", c.date, "date"),
          column("meal", c.meal, "text"),
          column("food", c.food, "text"),
          column("amount", c.amount, "number"),
          column("unit", c.unit, "text"),
          ...macros,
        ],
        rows: entryRows,
      },
    ],
  };
}

/** Das Export-Dokument eines Datensatzes für genau diesen Nutzer. */
export async function buildExportDocument(
  db: AppDatabase,
  user: ExportUser,
  dataset: ExportDataset,
  range: ExportRange,
  labels: ExportLabels,
): Promise<ExportDocument> {
  switch (dataset) {
    case "training":
      return buildTrainingExport(db, user, range, labels);
    case "weight":
      return buildWeightExport(db, user, range, labels);
    case "nutrition":
      return buildNutritionExport(db, user, range, labels);
  }
}
