/**
 * Texthilfen für das PDF: Zeichen ersetzen, die die Standardschrift nicht kennt, Texte messen,
 * kürzen und Spaltenbreiten verteilen. Bewusst ohne pdf-lib, damit alles einzeln testbar ist.
 */

/** Zeichen ohne eigene Breite (weiches Trennzeichen, Breitenlose, Variantenwähler): entfallen. */
const INVISIBLE = /[\u{AD}\u{200B}-\u{200F}\u{2060}\u{FEFF}\u{FE00}-\u{FE0F}]/gu;
const CONTROL = /\p{Cc}/gu;
const WHITESPACE = /\s+/gu;
const COMBINING_MARK = /\p{M}/gu;

export const REPLACEMENT_CHAR = "?";
export const ELLIPSIS = "…";

function isSupported(text: string, supported: ReadonlySet<number>): boolean {
  for (const char of text) {
    if (!supported.has(char.codePointAt(0) ?? -1)) return false;
  }
  return true;
}

/**
 * Macht aus beliebigem Text einen, den die Schrift darstellen kann. Helvetica kennt nur
 * WinAnsi; pdf-lib wirft bei jedem anderen Zeichen. Zeilenumbrüche und Tabs werden zu
 * Leerzeichen, Buchstaben mit unbekanntem Akzent verlieren ihn (č → c), der Rest wird `?`.
 */
export function sanitizeText(text: string, supported: ReadonlySet<number>): string {
  const normalized = text.normalize("NFC").replace(INVISIBLE, "").replace(CONTROL, " ").replace(WHITESPACE, " ").trim();
  let result = "";
  for (const char of normalized) {
    if (supported.has(char.codePointAt(0) ?? -1)) {
      result += char;
      continue;
    }
    const base = char.normalize("NFKD").replace(COMBINING_MARK, "");
    // Ein einzelnes Akzentzeichen ohne Buchstaben hat keinen Ersatz und entfällt.
    if (base === "") continue;
    result += isSupported(base, supported) ? base : REPLACEMENT_CHAR;
  }
  return result;
}

/** Breite eines einzelnen Zeichens bei Schriftgröße 1. */
export type CharWidth = (char: string) => number;

/** Breite eines Textes: Summe der Zeichenbreiten (pdf-lib zeichnet ohne Unterschneidung). */
export function textWidth(text: string, size: number, charWidth: CharWidth): number {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width * size;
}

/** Kürzt den Text mit „…“, bis er in die Breite passt. Passt nicht einmal das, bleibt er leer. */
export function fitText(text: string, maxWidth: number, size: number, charWidth: CharWidth): string {
  if (textWidth(text, size, charWidth) <= maxWidth) return text;
  const limit = maxWidth - charWidth(ELLIPSIS) * size;
  if (limit < 0) return "";
  let width = 0;
  let result = "";
  for (const char of text) {
    width += charWidth(char) * size;
    if (width > limit) break;
    result += char;
  }
  return result.trimEnd() + ELLIPSIS;
}

export interface ColumnDemand {
  /** Breite, bei der nichts gekürzt werden müsste. */
  natural: number;
  /** Textspalten dürfen schrumpfen; Zahlen und Datumswerte bleiben ganz lesbar. */
  flexible: boolean;
}

/**
 * Verteilt die verfügbare Breite. Reicht der Platz, bekommt jede Spalte ihre Wunschbreite.
 * Sonst behalten feste Spalten ihre Breite und die Textspalten teilen sich den Rest: schmale
 * zuerst voll, die breiten gleichmäßig. Reicht selbst das nicht, schrumpfen alle im Verhältnis.
 */
export function distributeWidths(columns: readonly ColumnDemand[], available: number, minimum: number): number[] {
  const natural = columns.map((column) => Math.max(minimum, column.natural));
  const total = natural.reduce((sum, width) => sum + width, 0);
  if (total <= available) return natural;

  const flexible = columns.flatMap((column, index) => (column.flexible ? [index] : []));
  const fixedTotal = natural.reduce((sum, width, index) => (columns[index].flexible ? sum : sum + width), 0);
  let remaining = available - fixedTotal;
  if (flexible.length === 0 || remaining < flexible.length * minimum) {
    return natural.map((width) => (width * available) / total);
  }

  const widths = [...natural];
  const open = [...flexible].sort((a, b) => natural[a] - natural[b]);
  while (open.length > 0) {
    const share = remaining / open.length;
    const index = open[0];
    if (natural[index] > share) {
      for (const rest of open) widths[rest] = share;
      break;
    }
    remaining -= natural[index];
    open.shift();
  }
  return widths;
}
