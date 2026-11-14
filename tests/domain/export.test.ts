import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { csvText, guardFormula, renderCsv } from "@/domain/export/csv";
import { formatCell, formatDecimal, formatGermanDate, toExcelSerial } from "@/domain/export/format";
import { LANDSCAPE_MIN_COLUMNS, renderPdf, type PdfOptions } from "@/domain/export/pdf";
import { distributeWidths, fitText, sanitizeText } from "@/domain/export/pdf-text";
import type { ExportColumn, ExportDocument, ExportTable } from "@/domain/export/types";
import { columnLetter, escapeXml, renderXlsx, sheetNames } from "@/domain/export/xlsx";

const columns: ExportColumn[] = [
  { key: "date", label: "Datum", type: "date" },
  { key: "name", label: "Lebensmittel", type: "text" },
  { key: "amount", label: "Menge", type: "number", decimals: 1 },
  { key: "kcal", label: "kcal", type: "number" },
];

const table: ExportTable = {
  key: "entries",
  name: "Einträge",
  columns,
  rows: [
    { date: "2026-11-16", name: "Müsli; \"Bio\"", amount: 62.5, kcal: 231 },
    { date: "2026-11-17", name: "=HYPERLINK(\"http://x\")", amount: 1, kcal: -0.25 },
    { date: "2026-11-18", name: "Zeile 1\nZeile 2", amount: null, kcal: 1234567.891 },
  ],
};

const pdfOptions: PdfOptions = {
  labels: { created: "Erstellt am 16.11.2026", empty: "Keine Daten", page: (current, total) => `Seite ${current} von ${total}` },
  createdAt: new Date("2026-11-16T10:00:00Z"),
};

function doc(tables: ExportTable[]): ExportDocument {
  return { title: "Ernährung", subtitle: "01.11.2026 – 16.11.2026", tables };
}

/** Viele Zeilen mit Umlauten, damit Tabellen über mehrere Seiten laufen. */
function longTable(rowCount: number, columnCount = 4): ExportTable {
  const wide: ExportColumn[] = Array.from({ length: columnCount }, (_, index) =>
    index === 0
      ? { key: "c0", label: "Datum", type: "date" }
      : index % 2 === 1
        ? { key: `c${index}`, label: `Übung ${index}`, type: "text" }
        : { key: `c${index}`, label: `Wert ${index}`, type: "number", decimals: 2 },
  );
  const rows = Array.from({ length: rowCount }, (_, row) =>
    Object.fromEntries(
      wide.map((column, index) => [
        column.key,
        index === 0 ? "2026-11-16" : column.type === "text" ? `Kniebeuge größer als üblich ${row}` : row * 1.25,
      ]),
    ),
  );
  return { key: "long", name: "Sätze", columns: wide, rows };
}

function unzipText(bytes: Uint8Array): Record<string, string> {
  return Object.fromEntries(Object.entries(unzipSync(bytes)).map(([path, content]) => [path, strFromU8(content)]));
}

describe("cell formatting", () => {
  it("formats dates as TT.MM.JJJJ and rejects impossible dates", () => {
    expect(formatGermanDate("2026-11-06")).toBe("06.11.2026");
    expect(formatGermanDate("2026-02-30")).toBeNull();
    expect(formatGermanDate("16.11.2026")).toBeNull();
  });

  it("uses a decimal comma without thousands separators", () => {
    expect(formatDecimal(1234567.891)).toBe("1234567,891");
    expect(formatDecimal(80, 2)).toBe("80,00");
    expect(formatDecimal(0.1 + 0.2)).toBe("0,3");
    expect(formatDecimal(12)).toBe("12");
    expect(formatDecimal(-0.001, 2)).toBe("0,00");
    expect(formatDecimal(Number.NaN)).toBe("");
  });

  it("treats values that do not fit the column type as text", () => {
    expect(formatCell(columns[2], "=1+1")).toEqual({ kind: "text", text: "=1+1" });
    expect(formatCell(columns[0], "gestern")).toEqual({ kind: "text", text: "gestern" });
    expect(formatCell(columns[1], 5)).toEqual({ kind: "text", text: "5" });
    expect(formatCell(columns[1], null)).toEqual({ kind: "empty", text: "" });
  });

  it("converts dates to Excel serial numbers", () => {
    expect(toExcelSerial("1970-01-01")).toBe(25569);
    expect(toExcelSerial("2026-11-16")).toBe(46342);
    expect(toExcelSerial("kein Datum")).toBeNull();
  });
});

describe("csv", () => {
  it("starts with a BOM and uses semicolons and CRLF", () => {
    const bytes = renderCsv(table);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(text.startsWith("\u{FEFF}Datum;Lebensmittel;Menge;kcal\r\n")).toBe(true);
    expect(text.endsWith("\r\n")).toBe(true);
  });

  it("quotes separators, quotes and line breaks", () => {
    const lines = csvText(table).split("\r\n");
    expect(lines[1]).toBe('16.11.2026;"Müsli; ""Bio""";62,5;231');
    expect(csvText(table)).toContain('18.11.2026;"Zeile 1\nZeile 2";;1234567,891\r\n');
  });

  it("writes numbers with a decimal comma and keeps real minus signs", () => {
    const lines = csvText(table).split("\r\n");
    expect(lines[2].endsWith(";1,0;-0,25")).toBe(true);
  });

  it("defuses cells that start like a formula", () => {
    for (const start of ["=", "+", "-", "@", "\t", "\r"]) expect(guardFormula(`${start}cmd`)).toBe(`'${start}cmd`);
    expect(guardFormula("Apfel")).toBe("Apfel");
    const lines = csvText(table).split("\r\n");
    expect(lines[2]).toBe('17.11.2026;"\'=HYPERLINK(""http://x"")";1,0;-0,25');
  });

  it("defuses headers and text in number columns too", () => {
    const tricky: ExportTable = {
      key: "t",
      name: "t",
      columns: [{ key: "a", label: "@Summe", type: "number" }],
      rows: [{ a: "+49 170" }, { a: "-2+3" }, { a: -2 }],
    };
    expect(csvText(tricky)).toBe("'@Summe\r\n'+49 170\r\n'-2+3\r\n-2\r\n");
  });

  it("writes only the header for an empty table", () => {
    expect(csvText({ ...table, rows: [] })).toBe("Datum;Lebensmittel;Menge;kcal\r\n");
  });
});

describe("xlsx", () => {
  it("contains all parts of a workbook with one sheet per table", () => {
    const files = unzipText(renderXlsx(doc([table, { ...table, key: "days", name: "Tagessummen" }])));
    expect(Object.keys(files).sort()).toEqual(
      [
        "[Content_Types].xml",
        "_rels/.rels",
        "xl/_rels/workbook.xml.rels",
        "xl/styles.xml",
        "xl/workbook.xml",
        "xl/worksheets/sheet1.xml",
        "xl/worksheets/sheet2.xml",
      ].sort(),
    );
    expect(files["xl/workbook.xml"]).toContain('<sheet name="Einträge" sheetId="1" r:id="rId1"/>');
    expect(files["xl/workbook.xml"]).toContain('<sheet name="Tagessummen" sheetId="2" r:id="rId2"/>');
    expect(files["[Content_Types].xml"]).toContain("/xl/worksheets/sheet2.xml");
    expect(files["xl/_rels/workbook.xml.rels"]).toContain('Target="worksheets/sheet2.xml"');
    expect(files["xl/_rels/workbook.xml.rels"]).toContain('Target="styles.xml"');
  });

  it("writes numbers as numbers and dates as serial numbers with a date format", () => {
    const sheet = unzipText(renderXlsx(doc([table])))["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<c r="A2" s="2"><v>46342</v></c>');
    expect(sheet).toContain('<c r="C2" s="4"><v>62.5</v></c>');
    expect(sheet).toContain('<c r="D2"><v>231</v></c>');
    expect(sheet).toContain('<c r="D3"><v>-0.25</v></c>');
    // Leere Zellen fehlen ganz.
    expect(sheet).not.toContain('r="C4"');
    const styles = unzipText(renderXlsx(doc([table])))["xl/styles.xml"];
    expect(styles).toContain('<xf numFmtId="14"');
    expect(styles).toContain('<numFmt numFmtId="164" formatCode="0.0"/>');
  });

  it("writes text as escaped inline strings and never as a formula", () => {
    const tricky: ExportTable = {
      key: "t",
      name: "Test",
      columns: [{ key: "a", label: "A & B <c>", type: "text" }],
      rows: [{ a: "=1+1" }, { a: 'Tom & "Jerry" <b>' }, { a: `Steuer${String.fromCharCode(0, 7, 11)}zeichen` }, { a: "_x000D_" }],
    };
    const sheet = unzipText(renderXlsx(doc([tricky])))["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">A &amp; B &lt;c&gt;</t></is></c>');
    expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t xml:space="preserve">=1+1</t></is></c>');
    expect(sheet).toContain("Tom &amp; &quot;Jerry&quot; &lt;b&gt;");
    expect(sheet).toContain(">Steuerzeichen<");
    expect(sheet).toContain(">_x005F_x000D_<");
    expect(sheet).not.toContain("<f>");
  });

  it("freezes the bold header row and sets column widths", () => {
    const sheet = unzipText(renderXlsx(doc([table])))["xl/worksheets/sheet1.xml"];
    expect(sheet).toContain('<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>');
    expect(sheet).toContain('<col min="2" max="2" width="24" customWidth="1"/>');
    expect(sheet.indexOf("<sheetViews>")).toBeLessThan(sheet.indexOf("<cols>"));
    expect(sheet.indexOf("<cols>")).toBeLessThan(sheet.indexOf("<sheetData>"));
  });

  it("limits sheet names to 31 valid, unique characters", () => {
    const names = sheetNames([
      { key: "a", name: "Cardio & Zusatzsport: alles / jede [Einheit] seit Beginn" },
      { key: "b", name: "'Sätze'" },
      { key: "c", name: "sätze" },
      { key: "d", name: "???" },
      { key: "e", name: "" },
    ]);
    expect(names[0]).toBe("Cardio & Zusatzsport alles jede");
    expect(names[0].length).toBeLessThanOrEqual(31);
    expect(names[1]).toBe("Sätze");
    expect(names[2]).toBe("sätze (2)");
    expect(names[3]).toBe("d");
    expect(names[4]).toBe("e");
    for (const name of names) expect(name).not.toMatch(/[\\/?*[\]:]/);
    const workbook = unzipText(renderXlsx(doc([{ ...table, name: "A & B" }])))["xl/workbook.xml"];
    expect(workbook).toContain('<sheet name="A &amp; B"');
  });

  it("names columns beyond Z", () => {
    expect([0, 25, 26, 27, 701, 702].map(columnLetter)).toEqual(["A", "Z", "AA", "AB", "ZZ", "AAA"]);
  });

  it("removes characters that XML does not allow", () => {
    expect(escapeXml(`a${String.fromCharCode(0xd800)}b${String.fromCharCode(0xffff)}c\td`)).toBe("abc\td");
    expect(escapeXml("😀 ok")).toBe("😀 ok");
  });

  it("opens even without tables", () => {
    const files = unzipText(renderXlsx(doc([])));
    expect(files["xl/worksheets/sheet1.xml"]).toContain("<sheetData>");
  });
});

describe("pdf text helpers", () => {
  const winAnsi = async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    return { font, supported: new Set(font.getCharacterSet()) };
  };

  it("keeps German text and replaces what Helvetica cannot draw", async () => {
    const { supported } = await winAnsi();
    expect(sanitizeText("Größe: Äpfel – „süß“ … 5 €", supported)).toBe("Größe: Äpfel – „süß“ … 5 €");
    expect(sanitizeText("Ćevapčići mit Łosoś", supported)).toBe("Cevapcici mit ?osos");
    expect(sanitizeText("Sushi 寿司 🍣", supported)).toBe("Sushi ?? ?");
    expect(sanitizeText("Zeile 1\r\nZeile 2\tEnde", supported)).toBe("Zeile 1 Zeile 2 Ende");
    expect(sanitizeText("a\u{200B}b\u{0308}", supported)).toBe("ab");
  });

  it("produces only encodable text for every character", async () => {
    const { font, supported } = await winAnsi();
    let all = "";
    for (let code = 0; code < 0x3000; code++) all += String.fromCodePoint(code);
    all += "😀🏋️‍♀️\u{10FFFF}";
    expect(() => font.encodeText(sanitizeText(all, supported))).not.toThrow();
    expect(() => font.encodeText("寿")).toThrow();
  });

  it("shortens long text with an ellipsis", () => {
    const width = () => 0.5;
    expect(fitText("kurz", 100, 10, width)).toBe("kurz");
    expect(fitText("ein sehr langer Text", 50, 10, width)).toBe("ein sehr…");
    expect(fitText("abc", 2, 10, width)).toBe("");
  });

  it("shrinks only text columns when the table is too wide", () => {
    expect(distributeWidths([{ natural: 50, flexible: false }, { natural: 100, flexible: true }], 300, 20)).toEqual([50, 100]);
    const widths = distributeWidths(
      [
        { natural: 50, flexible: false },
        { natural: 60, flexible: true },
        { natural: 300, flexible: true },
        { natural: 400, flexible: true },
      ],
      400,
      20,
    );
    expect(widths).toEqual([50, 60, 145, 145]);
    const squeezed = distributeWidths([{ natural: 300, flexible: false }, { natural: 300, flexible: false }], 300, 20);
    expect(squeezed).toEqual([150, 150]);
  });
});

describe("pdf", () => {
  it("creates a loadable one-page A4 document with metadata", async () => {
    const bytes = await renderPdf(doc([table]), pdfOptions);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Ernährung");
    const { width, height } = pdf.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("breaks long tables across pages", async () => {
    const one = await PDFDocument.load(await renderPdf(doc([longTable(40)]), pdfOptions));
    expect(one.getPageCount()).toBe(1);
    const many = await PDFDocument.load(await renderPdf(doc([longTable(400)]), pdfOptions));
    // 400 Zeilen zu je 13 pt bei rund 730 pt nutzbarer Höhe: acht Seiten.
    expect(many.getPageCount()).toBe(8);
    const pageLabels: string[] = [];
    await renderPdf(doc([longTable(400)]), {
      ...pdfOptions,
      labels: {
        ...pdfOptions.labels,
        page: (current, total) => {
          pageLabels.push(`${current}/${total}`);
          return `${current}/${total}`;
        },
      },
    });
    expect(pageLabels).toHaveLength(8);
    expect(pageLabels[0]).toBe("1/8");
    expect(pageLabels[7]).toBe("8/8");
  });

  it("uses landscape for the whole document when a table has many columns", async () => {
    const narrow = await PDFDocument.load(await renderPdf(doc([longTable(5, LANDSCAPE_MIN_COLUMNS - 1)]), pdfOptions));
    expect(narrow.getPage(0).getWidth()).toBeLessThan(narrow.getPage(0).getHeight());
    const wide = await PDFDocument.load(
      await renderPdf(doc([longTable(5, LANDSCAPE_MIN_COLUMNS - 1), longTable(50, LANDSCAPE_MIN_COLUMNS)]), pdfOptions),
    );
    // Die kurze erste Tabelle und der Anfang der zweiten teilen sich die erste Seite.
    expect(wide.getPageCount()).toBe(2);
    for (const page of wide.getPages()) {
      expect(Math.round(page.getWidth())).toBe(842);
      expect(Math.round(page.getHeight())).toBe(595);
    }
  });

  it("does not throw on characters outside WinAnsi", async () => {
    const special: ExportTable = {
      key: "s",
      name: "Sätze 寿司 🍣",
      columns: [
        { key: "a", label: "Übung → Ziel", type: "text" },
        { key: "b", label: "Wert ≥ 0", type: "number", decimals: 1 },
      ],
      rows: [
        { a: "Ćevapčići 🍖 mit Łosoś", b: 12.5 },
        { a: "Zeile 1\nZeile 2\tTab", b: null },
        { a: "x".repeat(2000), b: 1e12 },
        { a: `kaputt ${String.fromCharCode(0xd83d)} ${String.fromCharCode(1)}`, b: 0 },
      ],
    };
    const bytes = await renderPdf(
      { title: "Größe 寿司", subtitle: "∞ – ∞", tables: [special, { ...special, key: "empty", rows: [] }] },
      { labels: { created: "Erstellt 🕑", empty: "Keine Daten ∅", page: (current, total) => `Seite ${current} von ${total} →` } },
    );
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it("creates a title page for a document without tables", async () => {
    const pdf = await PDFDocument.load(await renderPdf(doc([]), pdfOptions));
    expect(pdf.getPageCount()).toBe(1);
  });
});
