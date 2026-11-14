import "server-only";
import { getTranslations } from "next-intl/server";
import { ACTIVITY_TYPES, INTENSITIES } from "@/domain/cardio/types";
import { formatGermanDate } from "@/domain/export/format";
import type { PdfLabels } from "@/domain/export/pdf";
import { AMOUNT_UNITS, MEALS } from "@/domain/nutrition/types";
import { SET_TYPES } from "@/domain/training/types";
import { toLocalDate } from "@/lib/dates";
import { weightUnitKey, type UnitSystem } from "@/lib/units";
import { EXPORT_DATASETS, type ExportDataset, type ExportTableKey } from "./datasets";
import type { ExportLabels } from "./services/export-service";

function record<K extends string, V>(keys: readonly K[], value: (key: K) => V): Record<K, V> {
  return Object.fromEntries(keys.map((key) => [key, value(key)])) as Record<K, V>;
}

/** Alle Beschriftungen des Exports aus dem Textkatalog, mit der Gewichtseinheit des Nutzers. */
export async function getExportLabels(unitSystem: UnitSystem): Promise<ExportLabels> {
  const [t, tTraining, tWorkout, tCardio, tNutrition] = await Promise.all([
    getTranslations("export"),
    getTranslations("training"),
    getTranslations("workout"),
    getTranslations("cardio"),
    getTranslations("nutrition"),
  ]);
  const unit = tTraining(`units.${weightUnitKey(unitSystem)}`);
  return {
    titles: record(EXPORT_DATASETS, (dataset) => t(`documentTitles.${dataset}`)),
    period: (from, to) => (from === null ? t("period.until", { to }) : t("period.range", { from, to })),
    tables: {
      sets: t("tables.sets"),
      sessions: t("tables.sessions"),
      activities: t("tables.activities"),
      weight: t("tables.weight"),
      days: t("tables.days"),
      entries: t("tables.entries"),
    },
    columns: {
      date: t("columns.date"),
      workout: t("columns.workout"),
      exercise: t("columns.exercise"),
      setNumber: t("columns.setNumber"),
      setType: t("columns.setType"),
      weight: t("columns.weight", { unit }),
      reps: t("columns.reps"),
      seconds: t("columns.seconds"),
      rir: t("columns.rir"),
      note: t("columns.note"),
      durationMinutes: t("columns.durationMinutes"),
      sets: t("columns.sets"),
      volume: t("columns.volume", { unit }),
      activityType: t("columns.activityType"),
      distanceKm: t("columns.distanceKm"),
      heartRate: t("columns.heartRate"),
      zone: t("columns.zone"),
      intensity: t("columns.intensity"),
      bodyWeight: t("columns.bodyWeight", { unit }),
      trend: t("columns.trend", { unit }),
      kcal: t("columns.kcal"),
      protein: t("columns.protein"),
      carbs: t("columns.carbs"),
      fat: t("columns.fat"),
      meal: t("columns.meal"),
      food: t("columns.food"),
      amount: t("columns.amount"),
      unit: t("columns.unit"),
    },
    focus: (focus) => tTraining(`focus.${focus}`),
    setTypes: record(SET_TYPES, (type) => tWorkout(`setTypes.${type}`)),
    activityTypes: record(ACTIVITY_TYPES, (type) => tCardio(`types.${type}`)),
    intensities: record(INTENSITIES, (intensity) => tCardio(`intensities.${intensity}`)),
    meals: record(MEALS, (meal) => tNutrition(`meals.${meal}`)),
    amountUnits: record(AMOUNT_UNITS, (unitKey) => tNutrition(`units.${unitKey}`)),
    unknownExercise: t("unknownExercise"),
  };
}

/** Texte, die nur das PDF braucht. Das Erstelldatum ist der heutige Tag in der Zeitzone der App. */
export async function getPdfLabels(now = new Date()): Promise<PdfLabels> {
  const t = await getTranslations("export");
  const today = toLocalDate(now);
  return {
    created: t("pdf.created", { date: formatGermanDate(today) ?? today }),
    empty: t("pdf.empty"),
    page: (current, total) => t("pdf.page", { current, total }),
  };
}

/** Für Dateinamen nur Kleinbuchstaben, Ziffern und Bindestriche – egal, was im Textkatalog steht. */
function slug(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "export"
  );
}

/** Dateiname ohne Endung: `clickfit-<datensatz>[-<tabelle>]-<von>-<bis>`. */
export async function getExportFileName(input: {
  dataset: ExportDataset;
  /** Nur gesetzt, wenn die Datei genau eine Tabelle eines größeren Datensatzes enthält. */
  table: ExportTableKey | null;
  from: string | null;
  to: string;
}): Promise<string> {
  const t = await getTranslations("export");
  const parts = [
    "clickfit",
    slug(t(`fileNames.datasets.${input.dataset}`)),
    ...(input.table ? [slug(t(`fileNames.tables.${input.table}`))] : []),
    input.from ?? slug(t("fileNames.all")),
    input.to,
  ];
  return parts.join("-");
}
