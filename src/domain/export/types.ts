/**
 * Gemeinsames Tabellenmodell für den Datenexport. CSV, Excel und PDF werden aus demselben
 * Dokument erzeugt, damit alle drei Formate dieselben Spalten und Werte zeigen.
 */

export type ExportColumnType = "text" | "number" | "date";

export interface ExportColumn {
  /** Schlüssel der Spalte in den Zeilen. */
  key: string;
  /** Sichtbare Überschrift (kommt aus dem Textkatalog). */
  label: string;
  type: ExportColumnType;
  /** Feste Zahl der Nachkommastellen bei Zahlen; ohne Angabe so genau wie nötig. */
  decimals?: number;
}

/** Zahlen als Zahl, Datum als lokales Datum `YYYY-MM-DD`, leere Zellen als `null`. */
export type ExportCellValue = string | number | null;

export type ExportRow = Record<string, ExportCellValue>;

export interface ExportTable {
  /** Technische Kennung, z. B. für die Auswahl der Tabelle im CSV-Export. */
  key: string;
  /** Sichtbarer Name (Blattname in Excel, Überschrift im PDF). */
  name: string;
  columns: ExportColumn[];
  rows: ExportRow[];
}

export interface ExportDocument {
  title: string;
  /** Zeitraum des Exports als fertiger Text. */
  subtitle: string;
  tables: ExportTable[];
}
