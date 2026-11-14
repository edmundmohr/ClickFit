/**
 * CSV für deutsches Excel: UTF-8 mit BOM, Semikolon als Trennzeichen, CRLF als Zeilenende,
 * Dezimalkomma und Datum als TT.MM.JJJJ. So öffnet ein Doppelklick die Datei richtig.
 *
 * Entscheidung: Eine CSV-Datei enthält genau eine Tabelle (Kopfzeile plus Daten, sonst nichts).
 * Mehrere Tabellen hintereinander mit Titelzeilen ließen sich nicht mehr sauber sortieren,
 * filtern oder in andere Programme einlesen. Welche Tabelle eines Dokuments exportiert wird,
 * entscheidet der Aufrufer; ohne Angabe ist es die erste (die Haupttabelle).
 */
import { formatCell } from "./format";
import type { ExportTable } from "./types";

export const CSV_SEPARATOR = ";";
export const CSV_LINE_END = "\r\n";
const BOM = "\u{FEFF}";

/** Zeichen, mit denen Tabellenprogramme eine Formel beginnen lassen. */
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[;"\r\n]|^\s|\s$/;

/**
 * Schutz vor Formel-Injektion: Beginnt ein Text wie eine Formel, entschärft ihn ein
 * vorangestelltes Hochkomma. Lebensmittelnamen und Notizen stammen nicht aus unserer Hand.
 */
export function guardFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

function quote(field: string): string {
  return NEEDS_QUOTES.test(field) ? `"${field.replaceAll('"', '""')}"` : field;
}

/** Text einer Textzelle bzw. Überschrift: erst entschärfen, dann bei Bedarf in Anführungszeichen. */
function textField(text: string): string {
  return quote(guardFormula(text));
}

/** Die Tabelle als CSV-Text (ohne BOM). */
export function csvText(table: ExportTable): string {
  const lines = [table.columns.map((column) => textField(column.label)).join(CSV_SEPARATOR)];
  for (const row of table.rows) {
    const fields = table.columns.map((column) => {
      const cell = formatCell(column, row[column.key]);
      // Zahlen und Datumswerte erzeugen wir selbst: Ein Minus vorn ist dort ein echtes Vorzeichen.
      return cell.kind === "text" ? textField(cell.text) : cell.text;
    });
    lines.push(fields.join(CSV_SEPARATOR));
  }
  return lines.join(CSV_LINE_END) + CSV_LINE_END;
}

/** Die Tabelle als fertige CSV-Datei (UTF-8 mit BOM). */
export function renderCsv(table: ExportTable): Uint8Array {
  return new TextEncoder().encode(BOM + csvText(table));
}
