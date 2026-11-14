/**
 * Liest CSV-Text in Zeilen und Felder: Trennzeichen automatisch (Semikolon, Tab, Komma),
 * optionale BOM, Anführungszeichen mit verdoppelten Anführungszeichen, CRLF oder LF.
 */

export interface CsvRecord {
  /** Zeilennummer in der Datei, beginnend bei 1. */
  line: number;
  fields: string[];
}

const DELIMITERS = [";", "\t", ","] as const;
const BOM = "\u{FEFF}";

/** Das häufigste Trennzeichen der ersten Zeile außerhalb von Anführungszeichen; bei Gleichstand das Semikolon. */
export function detectDelimiter(text: string): string {
  const counts = new Map<string, number>(DELIMITERS.map((delimiter) => [delimiter, 0]));
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && counts.has(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  }
  return DELIMITERS.reduce((best, delimiter) => ((counts.get(delimiter) ?? 0) > (counts.get(best) ?? 0) ? delimiter : best));
}

/** Alle nicht leeren Zeilen der Datei. Felder sind von Leerraum befreit. */
export function readCsv(input: string): CsvRecord[] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const delimiter = detectDelimiter(text.trimStart());
  const records: CsvRecord[] = [];
  let fields: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    fields.push(field.trim());
    field = "";
  };
  const endRecord = () => {
    endField();
    if (fields.some((value) => value !== "")) records.push({ line: recordLine, fields });
    fields = [];
    recordLine = line + 1;
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') quoted = false;
      else {
        if (char === "\n") line++;
        field += char;
      }
    } else if (char === '"' && field.trim() === "") quoted = true;
    else if (char === delimiter) endField();
    else if (char === "\n") {
      endRecord();
      line++;
    } else if (char !== "\r") field += char;
  }
  if (field !== "" || fields.length > 0) endRecord();
  return records;
}
