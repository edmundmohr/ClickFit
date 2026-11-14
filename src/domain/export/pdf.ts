/**
 * A4-PDF mit pdf-lib und der Standardschrift Helvetica: Titel, Zeitraum, Erstelldatum und je
 * Tabelle eine Überschrift mit Kopfzeile. Lange Tabellen laufen über mehrere Seiten (die
 * Kopfzeile wird wiederholt). Hat eine Tabelle viele Spalten, steht das ganze Dokument im
 * Querformat: So wechselt das Format nicht mitten im Dokument und kurze Tabellen teilen sich
 * eine Seite.
 *
 * Die Zellen schreiben wir direkt als PDF-Operatoren statt über `drawText`: Bei Tausenden
 * Zellen ist das deutlich schneller und die Datei bleibt klein.
 */
import {
  PDFDocument,
  StandardFonts,
  beginText,
  endText,
  fill,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setFillingGrayscaleColor,
  setFontAndSize,
  setTextMatrix,
  showText,
  type PDFFont,
  type PDFName,
  type PDFOperator,
  type PDFPage,
} from "pdf-lib";
import { formatCell } from "./format";
import { distributeWidths, fitText, sanitizeText, textWidth, type CharWidth } from "./pdf-text";
import type { ExportDocument, ExportTable } from "./types";

export const PDF_CONTENT_TYPE = "application/pdf";

export interface PdfLabels {
  /** Fertige Zeile mit dem Erstelldatum, z. B. „Erstellt am 16.11.2026“. */
  created: string;
  /** Hinweis unter einer Tabelle ohne Zeilen. */
  empty: string;
  /** Seitenzahl, z. B. „Seite 2 von 5“. */
  page: (current: number, total: number) => string;
}

export interface PdfOptions {
  labels: PdfLabels;
  /** Zeitstempel für die Metadaten der Datei; Standard ist jetzt. */
  createdAt?: Date;
}

/** A4 in Punkt (1/72 Zoll). */
const A4_SHORT = 595.28;
const A4_LONG = 841.89;
const MARGIN = 36;
const FOOTER_HEIGHT = 20;
/** Ab so vielen Spalten in einer Tabelle wird das Dokument im Querformat gesetzt. */
export const LANDSCAPE_MIN_COLUMNS = 7;

const TITLE_SIZE = 16;
const SUBTITLE_SIZE = 10;
const HEADING_SIZE = 11;
const CELL_SIZE = 8;
const ROW_HEIGHT = 13;
const CELL_PADDING = 3;
const MIN_COLUMN_WIDTH = 26;
const MAX_TEXT_COLUMN_WIDTH = 240;
const TABLE_GAP = 18;

const GRAY_TEXT = 0;
const GRAY_MUTED = 0.4;
const GRAY_HEADER_FILL = 0.88;
const GRAY_ZEBRA_FILL = 0.96;

type FontKind = "regular" | "bold";

interface Fonts {
  font: Record<FontKind, PDFFont>;
  charWidth: Record<FontKind, CharWidth>;
}

interface Sheet {
  page: PDFPage;
  width: number;
  height: number;
  keys: Record<FontKind, PDFName>;
  operators: PDFOperator[];
}

interface TextItem {
  x: number;
  y: number;
  text: string;
}

interface PreparedColumn {
  label: string;
  alignRight: boolean;
  width: number;
}

interface PreparedTable {
  name: string;
  columns: PreparedColumn[];
  rows: string[][];
}

/** Zeichenbreiten je Schrift merken: Dieselben wenigen Zeichen kommen zigtausendfach vor. */
function cachedCharWidth(font: PDFFont): CharWidth {
  const cache = new Map<string, number>();
  return (char) => {
    let width = cache.get(char);
    if (width === undefined) {
      width = font.widthOfTextAtSize(char, 1);
      cache.set(char, width);
    }
    return width;
  };
}

function pageWidth(landscape: boolean): number {
  return landscape ? A4_LONG : A4_SHORT;
}

function prepareTable(table: ExportTable, fonts: Fonts, landscape: boolean, clean: (text: string) => string): PreparedTable {
  const labels = table.columns.map((column) => clean(column.label));
  const rows = table.rows.map((row) => table.columns.map((column) => clean(formatCell(column, row[column.key]).text)));
  const demands = table.columns.map((column, index) => {
    let natural = textWidth(labels[index], CELL_SIZE, fonts.charWidth.bold);
    for (const row of rows) natural = Math.max(natural, textWidth(row[index], CELL_SIZE, fonts.charWidth.regular));
    const flexible = column.type === "text";
    const padded = natural + 2 * CELL_PADDING;
    return { natural: flexible ? Math.min(MAX_TEXT_COLUMN_WIDTH, padded) : padded, flexible };
  });
  const widths = distributeWidths(demands, pageWidth(landscape) - 2 * MARGIN, MIN_COLUMN_WIDTH);
  return {
    name: clean(table.name),
    columns: table.columns.map((column, index) => ({
      label: labels[index],
      alignRight: column.type === "number",
      width: widths[index],
    })),
    rows,
  };
}

/** Das Dokument als PDF-Datei. */
export async function renderPdf(document: ExportDocument, options: PdfOptions): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fonts: Fonts = {
    font: { regular, bold },
    charWidth: { regular: cachedCharWidth(regular), bold: cachedCharWidth(bold) },
  };
  const supported = new Set(regular.getCharacterSet());
  const clean = (text: string) => sanitizeText(text, supported);

  const createdAt = options.createdAt ?? new Date();
  pdf.setTitle(document.title);
  pdf.setSubject(document.subtitle);
  pdf.setLanguage("de");
  pdf.setCreationDate(createdAt);
  pdf.setModificationDate(createdAt);

  const sheets: Sheet[] = [];
  let y = 0;

  const landscape = document.tables.some((table) => table.columns.length >= LANDSCAPE_MIN_COLUMNS);

  function addSheet(): Sheet {
    const width = pageWidth(landscape);
    const height = landscape ? A4_SHORT : A4_LONG;
    const page = pdf.addPage([width, height]);
    const sheet: Sheet = {
      page,
      width,
      height,
      keys: {
        regular: page.node.newFontDictionary(regular.name, regular.ref),
        bold: page.node.newFontDictionary(bold.name, bold.ref),
      },
      operators: [],
    };
    sheets.push(sheet);
    y = height - MARGIN;
    return sheet;
  }

  function drawTexts(sheet: Sheet, kind: FontKind, size: number, gray: number, items: readonly TextItem[]): void {
    const visible = items.filter((item) => item.text !== "");
    if (visible.length === 0) return;
    sheet.operators.push(beginText(), setFillingGrayscaleColor(gray), setFontAndSize(sheet.keys[kind], size));
    for (const item of visible) {
      sheet.operators.push(setTextMatrix(1, 0, 0, 1, item.x, item.y), showText(fonts.font[kind].encodeText(item.text)));
    }
    sheet.operators.push(endText());
  }

  function fillRect(sheet: Sheet, x: number, bottom: number, width: number, height: number, gray: number): void {
    sheet.operators.push(
      pushGraphicsState(),
      setFillingGrayscaleColor(gray),
      rectangle(x, bottom, width, height),
      fill(),
      popGraphicsState(),
    );
  }

  /** Eine Textzeile über die Seitenbreite; `y` wandert um die Zeilenhöhe nach unten. */
  function drawLine(sheet: Sheet, text: string, kind: FontKind, size: number, gray: number, gap: number): void {
    const fitted = fitText(text, sheet.width - 2 * MARGIN, size, fonts.charWidth[kind]);
    y -= size;
    drawTexts(sheet, kind, size, gray, [{ x: MARGIN, y, text: fitted }]);
    y -= gap;
  }

  /** Eine Tabellenzeile ab der aktuellen Höhe; `y` wandert um eine Zeile nach unten. */
  function drawRow(sheet: Sheet, table: PreparedTable, cells: readonly string[], kind: FontKind, fillGray: number | null): void {
    const bottom = y - ROW_HEIGHT;
    const tableWidth = table.columns.reduce((sum, column) => sum + column.width, 0);
    if (fillGray !== null) fillRect(sheet, MARGIN, bottom, tableWidth, ROW_HEIGHT, fillGray);
    const baseline = bottom + (ROW_HEIGHT - CELL_SIZE) / 2 + CELL_SIZE * 0.2;
    const charWidth = fonts.charWidth[kind];
    let x = MARGIN;
    const items = table.columns.map((column, index) => {
      const text = fitText(cells[index] ?? "", column.width - 2 * CELL_PADDING, CELL_SIZE, charWidth);
      const left = column.alignRight
        ? x + column.width - CELL_PADDING - textWidth(text, CELL_SIZE, charWidth)
        : x + CELL_PADDING;
      x += column.width;
      return { x: left, y: baseline, text };
    });
    drawTexts(sheet, kind, CELL_SIZE, GRAY_TEXT, items);
    y = bottom;
  }

  function drawHeaderRow(sheet: Sheet, table: PreparedTable): void {
    drawRow(
      sheet,
      table,
      table.columns.map((column) => column.label),
      "bold",
      GRAY_HEADER_FILL,
    );
  }

  const tables = document.tables.map((table) => prepareTable(table, fonts, landscape, clean));
  const bottomLimit = MARGIN + FOOTER_HEIGHT;
  let sheet = addSheet();
  drawLine(sheet, clean(document.title), "bold", TITLE_SIZE, GRAY_TEXT, 6);
  drawLine(sheet, clean(document.subtitle), "regular", SUBTITLE_SIZE, GRAY_TEXT, 4);
  drawLine(sheet, clean(options.labels.created), "regular", CELL_SIZE, GRAY_MUTED, TABLE_GAP);

  for (const table of tables) {
    // Überschrift, Kopfzeile und mindestens eine Datenzeile sollen zusammen auf einer Seite stehen.
    const needed = HEADING_SIZE + 6 + 2 * ROW_HEIGHT;
    if (y - needed < bottomLimit) sheet = addSheet();
    drawLine(sheet, table.name, "bold", HEADING_SIZE, GRAY_TEXT, 6);
    if (table.rows.length === 0) {
      drawLine(sheet, clean(options.labels.empty), "regular", CELL_SIZE, GRAY_MUTED, TABLE_GAP);
      continue;
    }
    drawHeaderRow(sheet, table);
    table.rows.forEach((row, index) => {
      if (y - ROW_HEIGHT < bottomLimit) {
        sheet = addSheet();
        drawHeaderRow(sheet, table);
      }
      drawRow(sheet, table, row, "regular", index % 2 === 1 ? GRAY_ZEBRA_FILL : null);
    });
    y -= TABLE_GAP;
  }

  // Die Gesamtzahl der Seiten steht erst jetzt fest: Fußzeilen zum Schluss setzen.
  const footerTitle = clean(document.title);
  sheets.forEach((current, index) => {
    const label = clean(options.labels.page(index + 1, sheets.length));
    const labelWidth = textWidth(label, CELL_SIZE, fonts.charWidth.regular);
    const titleSpace = current.width - 2 * MARGIN - labelWidth - 12;
    drawTexts(current, "regular", CELL_SIZE, GRAY_MUTED, [
      { x: MARGIN, y: MARGIN, text: fitText(footerTitle, titleSpace, CELL_SIZE, fonts.charWidth.regular) },
      { x: current.width - MARGIN - labelWidth, y: MARGIN, text: label },
    ]);
    current.page.pushOperators(...current.operators);
  });

  return pdf.save();
}
