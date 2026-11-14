/**
 * CSV-Import für Gewicht, Schritte, Ruhepuls und Aktivitäten. Die Kopfzeile wird anhand
 * deutscher und englischer Namen erkannt; fehlt sie, gilt die übliche Reihenfolge der Spalten.
 * Die von der App exportierte CSV (Semikolon, TT.MM.JJJJ, Dezimalkomma, Formelschutz mit
 * führendem Hochkomma) lässt sich so wieder einlesen.
 */
import { createCollector, type HealthImportCollector } from "./collector";
import { readCsv, type CsvRecord } from "./csv-reader";
import { parseMoment } from "./timestamps";
import { LIMITS, emptyHealthImport, type CsvKind, type EntryIssue, type HealthImport } from "./types";
import { toKg, weightUnitOf, type WeightUnit } from "./values";
import { STRENGTH, mapWorkoutName } from "./workout-types";

export const MAX_REPORTED_ERRORS = 20;

export interface CsvRowError {
  line: number;
  issue: EntryIssue;
}

/** Die Datei als Ganzes ist unbrauchbar: leer, ohne erkennbare Spalten oder zu lang. */
export type CsvFatal = "empty" | "columns" | "too_many_rows";

export interface CsvParseResult {
  data: HealthImport;
  /** Datenzeilen ohne Kopfzeile. */
  rows: number;
  /** Höchstens `MAX_REPORTED_ERRORS` Zeilenfehler; `errorCount` nennt alle. */
  errors: CsvRowError[];
  errorCount: number;
  fatal: CsvFatal | null;
}

type Column = "date" | "value" | "type" | "duration" | "distance" | "heartRate";
type Columns = Partial<Record<Column, number>>;

/** Erkennungsmuster je Spalte; geprüft wird der Anfang der bereinigten Überschrift. */
const DATE_PATTERN = /^(datum|date|tag|day|start|beginn|zeit|time)/;
const HEART_RATE_PATTERN = /^(puls|ruhepuls|resting|heart ?rate|herzfrequenz|bpm|hf\b|rhr)/;
const VALUE_PATTERNS: Record<Exclude<CsvKind, "activities">, RegExp> = {
  weight: /^(gewicht|körpergewicht|weight|body ?weight|kg|lbs?\b|masse)/,
  steps: /^(schritte|steps?\b|step count|anzahl|count)/,
  resting_heart_rate: HEART_RATE_PATTERN,
};
const ACTIVITY_PATTERNS: Record<Exclude<Column, "date" | "value">, RegExp> = {
  type: /^(art|typ|type|activity|aktivität|sportart|sport|workout|name)/,
  duration: /^(dauer|duration|minuten|minutes|min\b)/,
  distance: /^(distanz|distance|strecke|km)/,
  heartRate: HEART_RATE_PATTERN,
};
/** Reihenfolge der Spalten, wenn die Datei keine Kopfzeile hat. */
const DEFAULT_COLUMNS: Record<CsvKind, Columns> = {
  weight: { date: 0, value: 1 },
  steps: { date: 0, value: 1 },
  resting_heart_rate: { date: 0, value: 1 },
  activities: { date: 0, type: 1, duration: 2, distance: 3, heartRate: 4 },
};
const REQUIRED: Record<CsvKind, Column[]> = {
  weight: ["date", "value"],
  steps: ["date", "value"],
  resting_heart_rate: ["date", "value"],
  activities: ["date", "type", "duration"],
};

/** Entfernt den Formelschutz (führendes Hochkomma) und Leerraum. */
function clean(field: string | undefined): string {
  return (field ?? "").replace(/^'/, "").trim();
}

function findColumn(headers: string[], pattern: RegExp, taken: Set<number>): number | undefined {
  // „Puls-Zone“ ist kein Puls, „Trend (kg)“ kein Messwert.
  const index = headers.findIndex((header, position) => !taken.has(position) && pattern.test(header) && !/zone|trend/.test(header));
  if (index < 0) return undefined;
  taken.add(index);
  return index;
}

function detectColumns(headers: string[], kind: CsvKind): Columns {
  const taken = new Set<number>();
  const columns: Columns = { date: findColumn(headers, DATE_PATTERN, taken) };
  if (kind === "activities") {
    for (const column of ["type", "duration", "distance", "heartRate"] as const) {
      columns[column] = findColumn(headers, ACTIVITY_PATTERNS[column], taken);
    }
  } else {
    columns.value = findColumn(headers, VALUE_PATTERNS[kind], taken);
  }
  return columns;
}

/** Zahl mit Dezimalkomma oder -punkt; Tausenderpunkte („12.345“) nur bei ganzen Zahlen. */
export function parseCsvNumber(field: string, integer = false): number | null {
  let text = field.replace(/\s/g, "");
  if (text === "") return null;
  if (text.includes(",") && text.includes(".")) {
    // Das letzte der beiden Zeichen ist das Dezimalzeichen, das andere trennt Tausender.
    text = text.lastIndexOf(",") > text.lastIndexOf(".") ? text.replaceAll(".", "").replace(",", ".") : text.replaceAll(",", "");
  } else if (integer && /^\d{1,3}([.,]\d{3})+$/.test(text)) {
    text = text.replace(/[.,]/g, "");
  } else {
    text = text.replace(",", ".");
  }
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

interface RowContext {
  kind: CsvKind;
  columns: Columns;
  weightUnit: WeightUnit;
  collector: HealthImportCollector;
}

/** Übernimmt eine Datenzeile; gibt den Grund zurück, wenn sie nicht übernommen wurde. */
function readRow(record: CsvRecord, context: RowContext): EntryIssue | null {
  const { kind, columns, collector } = context;
  const cell = (column: Column) => {
    const index = columns[column];
    return index === undefined ? "" : clean(record.fields[index]);
  };
  const when = parseMoment(cell("date"));
  const reject = (issue: EntryIssue) => {
    collector.skip();
    return issue;
  };
  if (when === null) return reject("date");

  if (kind !== "activities") {
    const value = parseCsvNumber(cell("value"), kind === "steps");
    if (value === null) return reject("value");
    if (kind === "weight") return collector.addWeight(when, toKg(value, context.weightUnit));
    return kind === "steps" ? collector.addSteps(when, value) : collector.addRestingHeartRate(when, value);
  }

  const typeText = cell("type");
  if (typeText === "") return reject("type");
  const type = mapWorkoutName(typeText);
  if (type === STRENGTH) return reject("strength");
  const minutes = parseCsvNumber(cell("duration"));
  if (minutes === null) return reject("value");
  const distanceKm = parseCsvNumber(cell("distance"));
  return collector.addWorkout({
    id: null,
    type,
    start: when,
    durationSeconds: minutes * 60,
    distanceMeters: distanceKm === null ? null : distanceKm * 1000,
    avgHeartRate: parseCsvNumber(cell("heartRate")),
  });
}

export function parseCsv(text: string, kind: CsvKind, now: Date = new Date()): CsvParseResult {
  const failed = (fatal: CsvFatal, rows = 0): CsvParseResult => ({ data: emptyHealthImport(), rows, errors: [], errorCount: 0, fatal });
  const records = readCsv(text);
  const [first] = records;
  if (!first) return failed("empty");

  // Beginnt die erste Zeile mit einem Datum, hat die Datei keine Kopfzeile.
  const hasHeader = parseMoment(clean(first.fields[0])) === null;
  const headers = first.fields.map((field) => clean(field).toLowerCase());
  const columns = hasHeader ? detectColumns(headers, kind) : DEFAULT_COLUMNS[kind];
  if (REQUIRED[kind].some((column) => columns[column] === undefined)) return failed("columns");

  const rows = hasHeader ? records.slice(1) : records;
  if (rows.length === 0) return failed("empty");
  if (rows.length > LIMITS.maxEntriesPerKind) return failed("too_many_rows", rows.length);

  const valueHeader = columns.value === undefined ? "" : (headers[columns.value] ?? "");
  const context: RowContext = {
    kind,
    columns,
    weightUnit: (hasHeader ? weightUnitOf(valueHeader) : null) ?? "kg",
    collector: createCollector(now),
  };
  const errors: CsvRowError[] = [];
  let errorCount = 0;
  for (const record of rows) {
    const issue = readRow(record, context);
    if (issue === null) continue;
    errorCount += 1;
    if (errors.length < MAX_REPORTED_ERRORS) errors.push({ line: record.line, issue });
  }
  return { data: context.collector.build(), rows: rows.length, errors, errorCount, fatal: null };
}
