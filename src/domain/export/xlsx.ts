/**
 * Echte .xlsx-Datei ohne schwere Bibliothek: Die wenigen XML-Teile schreiben wir selbst und
 * packen sie mit fflate. Ein Blatt pro Tabelle, Kopfzeile fett und fixiert.
 *
 * Formelschutz: Texte stehen immer als Inline-String (`t="inlineStr"`) in der Zelle, nie als
 * Formel. Excel zeigt deshalb auch `=1+1` als Text an.
 */
import { zipSync } from "fflate";
import { formatCell, toExcelSerial } from "./format";
import type { ExportColumn, ExportDocument, ExportTable } from "./types";

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PACKAGE_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

const SHEET_NAME_MAX = 31;
const MIN_COLUMN_WIDTH = 8;
const MAX_COLUMN_WIDTH = 60;
/** Mehr Zeilen brauchen wir für die Spaltenbreite nicht anzusehen. */
const WIDTH_SAMPLE_ROWS = 2000;

/** Formatvorlagen (Index in `cellXfs`). Zahlen mit n Nachkommastellen: `STYLE_DECIMALS_BASE + n`. */
const STYLE_HEADER = 1;
const STYLE_DATE = 2;
const STYLE_DECIMALS_BASE = 3;
const MAX_STYLE_DECIMALS = 3;

/** Alles, was in XML 1.0 nicht vorkommen darf (Steuerzeichen, einzelne Surrogate, U+FFFE/FFFF). */
const INVALID_XML_CHARS = /[^\t\n\r\u{20}-\u{D7FF}\u{E000}-\u{FFFD}\u{10000}-\u{10FFFF}]/gu;
/** Excel liest `_x000D_` als kodiertes Zeichen; ein echter Text dieser Form wird maskiert. */
const EXCEL_ESCAPE = /_x([0-9A-Fa-f]{4})_/g;

export function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML_CHARS, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Gültige, eindeutige Blattnamen: höchstens 31 Zeichen, ohne `\ / ? * [ ] :`, ohne Hochkomma
 * am Rand und nie leer. Doppelte Namen bekommen eine laufende Nummer.
 */
export function sheetNames(tables: readonly Pick<ExportTable, "name" | "key">[]): string[] {
  const used = new Set<string>();
  return tables.map((table, index) => {
    const clean = (value: string) =>
      value
        .replace(INVALID_XML_CHARS, "")
        .replace(/[\\/?*[\]:]/g, " ")
        .replace(/\s+/g, " ")
        .replace(/^[\s']+|[\s']+$/g, "");
    const base = clean(table.name) || clean(table.key) || String(index + 1);
    let name = truncate(base, SHEET_NAME_MAX);
    for (let counter = 2; used.has(name.toLowerCase()); counter++) {
      const suffix = ` (${counter})`;
      name = truncate(base, SHEET_NAME_MAX - suffix.length) + suffix;
    }
    used.add(name.toLowerCase());
    return name;
  });
}

/** Kürzt auf höchstens `max` UTF-16-Einheiten, ohne ein Zeichen (Surrogatpaar) zu zerteilen. */
function truncate(text: string, max: number): string {
  let result = "";
  for (const char of text) {
    if (result.length + char.length > max) break;
    result += char;
  }
  return result.trimEnd();
}

/** 0 → A, 25 → Z, 26 → AA … */
export function columnLetter(index: number): string {
  let letters = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  }
  return letters;
}

function textCell(ref: string, text: string, style?: number): string {
  const styleAttribute = style === undefined ? "" : ` s="${style}"`;
  const safe = escapeXml(text.replace(EXCEL_ESCAPE, "_x005F_x$1_"));
  return `<c r="${ref}" t="inlineStr"${styleAttribute}><is><t xml:space="preserve">${safe}</t></is></c>`;
}

function numberStyle(column: ExportColumn): number {
  if (column.decimals === undefined) return 0;
  return STYLE_DECIMALS_BASE + Math.min(MAX_STYLE_DECIMALS, Math.max(0, Math.trunc(column.decimals)));
}

function dataCell(ref: string, column: ExportColumn, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    if (column.type !== "number") return textCell(ref, String(value));
    const style = numberStyle(column);
    return `<c r="${ref}"${style === 0 ? "" : ` s="${style}"`}><v>${value}</v></c>`;
  }
  if (column.type === "date") {
    const serial = toExcelSerial(value);
    if (serial !== null) return `<c r="${ref}" s="${STYLE_DATE}"><v>${serial}</v></c>`;
  }
  return textCell(ref, value);
}

/** Breite je Spalte in Zeichen, aus Überschrift und Inhalt geschätzt. */
function columnWidths(table: ExportTable): number[] {
  const rows = table.rows.slice(0, WIDTH_SAMPLE_ROWS);
  return table.columns.map((column) => {
    let longest = column.label.length;
    for (const row of rows) longest = Math.max(longest, formatCell(column, row[column.key]).text.length);
    return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, longest + 2));
  });
}

function sheetXml(table: ExportTable): string {
  const letters = table.columns.map((_, index) => columnLetter(index));
  const cols = columnWidths(table)
    .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
    .join("");
  const header = table.columns.map((column, index) => textCell(`${letters[index]}1`, column.label, STYLE_HEADER)).join("");
  const rows = [`<row r="1">${header}</row>`];
  table.rows.forEach((row, rowIndex) => {
    const number = rowIndex + 2;
    const cells = table.columns.map((column, index) => dataCell(`${letters[index]}${number}`, column, row[column.key]));
    rows.push(`<row r="${number}">${cells.join("")}</row>`);
  });
  return (
    `${XML_HEADER}<worksheet xmlns="${MAIN_NS}">` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    "</sheetView></sheetViews>" +
    (cols ? `<cols>${cols}</cols>` : "") +
    `<sheetData>${rows.join("")}</sheetData>` +
    "</worksheet>"
  );
}

function stylesXml(): string {
  // Eigene Zahlenformate nur dort, wo Excel kein eingebautes hat (1 = „0“, 2 = „0.00“, 14 = Datum).
  const decimalFormats = [1, 164, 2, 165];
  const numberXfs = decimalFormats
    .map((id) => `<xf numFmtId="${id}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`)
    .join("");
  return (
    `${XML_HEADER}<styleSheet xmlns="${MAIN_NS}">` +
    '<numFmts count="2"><numFmt numFmtId="164" formatCode="0.0"/><numFmt numFmtId="165" formatCode="0.000"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${3 + decimalFormats.length}">` +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    numberXfs +
    "</cellXfs>" +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    "</styleSheet>"
  );
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");
  return (
    `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    `<Override PartName="/xl/workbook.xml" ContentType="${XLSX_CONTENT_TYPE}.main+xml"/>` +
    sheets +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    "</Types>"
  );
}

function rootRelsXml(): string {
  return (
    `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">` +
    `<Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/>` +
    "</Relationships>"
  );
}

function workbookXml(names: readonly string[]): string {
  const sheets = names
    .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return `${XML_HEADER}<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><sheets>${sheets}</sheets></workbook>`;
}

function workbookRelsXml(sheetCount: number): string {
  const sheets = Array.from(
    { length: sheetCount },
    (_, index) => `<Relationship Id="rId${index + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");
  return (
    `${XML_HEADER}<Relationships xmlns="${PACKAGE_REL_NS}">` +
    sheets +
    `<Relationship Id="rId${sheetCount + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>` +
    "</Relationships>"
  );
}

/** Das Dokument als .xlsx-Datei. Ein Dokument ohne Tabelle bekommt ein leeres Blatt, damit Excel es öffnet. */
export function renderXlsx(document: ExportDocument): Uint8Array {
  const tables: ExportTable[] =
    document.tables.length > 0 ? document.tables : [{ key: "data", name: document.title, columns: [], rows: [] }];
  const names = sheetNames(tables);
  const encoder = new TextEncoder();
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": encoder.encode(contentTypesXml(tables.length)),
    "_rels/.rels": encoder.encode(rootRelsXml()),
    "xl/workbook.xml": encoder.encode(workbookXml(names)),
    "xl/_rels/workbook.xml.rels": encoder.encode(workbookRelsXml(tables.length)),
    "xl/styles.xml": encoder.encode(stylesXml()),
  };
  tables.forEach((table, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = encoder.encode(sheetXml(table));
  });
  return zipSync(files, { level: 6 });
}
