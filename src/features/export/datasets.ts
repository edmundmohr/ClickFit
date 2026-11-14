/**
 * Was sich exportieren lässt. Ohne Server-Abhängigkeiten, damit auch die Oberfläche die
 * Listen nutzen kann.
 */
import type { LocalDate } from "@/lib/dates";

export const EXPORT_DATASETS = ["training", "weight", "nutrition"] as const;
export type ExportDataset = (typeof EXPORT_DATASETS)[number];

export const EXPORT_FORMATS = ["csv", "xlsx", "pdf"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

/**
 * Tabellen je Datensatz in der Reihenfolge der Blätter. Eine CSV-Datei enthält genau eine
 * Tabelle: ohne Angabe die erste.
 */
export const EXPORT_TABLES = {
  training: ["sets", "sessions", "activities"],
  weight: ["weight"],
  nutrition: ["days", "entries"],
} as const satisfies Record<ExportDataset, readonly string[]>;

export type ExportTableKey = (typeof EXPORT_TABLES)[ExportDataset][number];

/** Zeitraum des Exports, beide Tage eingeschlossen. Ohne `from` beginnt er beim ersten Eintrag. */
export interface ExportRange {
  from: LocalDate | null;
  to: LocalDate;
}

export function isExportDataset(value: unknown): value is ExportDataset {
  return typeof value === "string" && (EXPORT_DATASETS as readonly string[]).includes(value);
}

export function isTableOf(dataset: ExportDataset, value: unknown): value is ExportTableKey {
  return typeof value === "string" && (EXPORT_TABLES[dataset] as readonly string[]).includes(value);
}

export const EXPORT_API_PATH = "/api/export";

/** Adresse der Download-Route. Die Tabelle ist nur für CSV nötig (sonst kommen alle Tabellen). */
export function exportUrl(input: {
  dataset: ExportDataset;
  format: ExportFormat;
  range: ExportRange;
  table?: ExportTableKey;
}): string {
  const params = new URLSearchParams({ format: input.format });
  if (input.range.from) params.set("from", input.range.from);
  params.set("to", input.range.to);
  if (input.table) params.set("table", input.table);
  return `${EXPORT_API_PATH}/${input.dataset}?${params.toString()}`;
}
