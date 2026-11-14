/**
 * Formatierung der Zellen für die Textformate (CSV und PDF): deutsches Datum und Dezimalkomma.
 */
import type { ExportCellValue, ExportColumn } from "./types";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Tage zwischen dem Nullpunkt von Excel (30.12.1899) und dem 01.01.1970. */
const EXCEL_EPOCH_OFFSET_DAYS = 25569;
/** Ohne feste Nachkommastellen wird auf so viele Stellen gerundet (verdeckt Gleitkomma-Reste). */
const MAX_FREE_DECIMALS = 6;
const MAX_DECIMALS = 10;

/** UTC-Mitternacht eines lokalen Datums `YYYY-MM-DD`; `null`, wenn es dieses Datum nicht gibt. */
function parseIsoDate(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? date.getTime() : null;
}

/** `2026-11-16` → `16.11.2026`; `null`, wenn der Wert kein gültiges Datum ist. */
export function formatGermanDate(value: string): string | null {
  const match = ISO_DATE.exec(value);
  return match && parseIsoDate(value) !== null ? `${match[3]}.${match[2]}.${match[1]}` : null;
}

/** Seriennummer des Datums in Excel (1900er-System); `null`, wenn der Wert kein gültiges Datum ist. */
export function toExcelSerial(value: string): number | null {
  const time = parseIsoDate(value);
  return time === null ? null : Math.round(time / DAY_MS) + EXCEL_EPOCH_OFFSET_DAYS;
}

/** Zahl mit Dezimalkomma und ohne Tausenderpunkt; nicht endliche Werte ergeben einen leeren Text. */
export function formatDecimal(value: number, decimals?: number): string {
  if (!Number.isFinite(value)) return "";
  let text: string;
  if (decimals === undefined) {
    text = value.toFixed(MAX_FREE_DECIMALS).replace(/\.?0+$/, "");
  } else {
    text = value.toFixed(Math.min(MAX_DECIMALS, Math.max(0, Math.trunc(decimals))));
  }
  // Aus −0,00 wird 0,00: Ein Minus vor lauter Nullen wäre irreführend.
  if (/^-0(\.0*)?$/.test(text)) text = text.slice(1);
  return text.replace(".", ",");
}

export type FormattedKind = "empty" | "text" | "number" | "date";

export interface FormattedCell {
  kind: FormattedKind;
  text: string;
}

/**
 * Text einer Zelle. Passt der Wert nicht zum Typ der Spalte (z. B. Text in einer Zahlenspalte),
 * gilt er als Text – das ist wichtig für den Formelschutz in der CSV.
 */
export function formatCell(column: ExportColumn, value: ExportCellValue | undefined): FormattedCell {
  if (value === null || value === undefined || value === "") return { kind: "empty", text: "" };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { kind: "empty", text: "" };
    return column.type === "number"
      ? { kind: "number", text: formatDecimal(value, column.decimals) }
      : { kind: "text", text: formatDecimal(value) };
  }
  if (column.type === "date") {
    const date = formatGermanDate(value);
    if (date !== null) return { kind: "date", text: date };
  }
  return { kind: "text", text: value };
}
