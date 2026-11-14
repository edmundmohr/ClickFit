/**
 * Hilfen für typische Fehler und Kurzbefehle der Übungsbibliothek.
 * Ein Fehler steht als „Fehler – Korrektur“ in den Daten und wird für die Anzeige getrennt.
 */

export const MISTAKE_SEPARATOR = " – ";

export interface MistakeParts {
  /** Was falsch läuft, z. B. „Hohlkreuz“. */
  fault: string;
  /** Wie es richtig geht, großgeschrieben, weil es als eigene Zeile erscheint; leer ohne Trenner. */
  fix: string;
}

export function splitMistake(text: string): MistakeParts {
  const index = text.indexOf(MISTAKE_SEPARATOR);
  if (index < 0) return { fault: text.trim(), fix: "" };
  const fix = text.slice(index + MISTAKE_SEPARATOR.length).trim();
  return {
    fault: text.slice(0, index).trim(),
    fix: fix.charAt(0).toUpperCase() + fix.slice(1),
  };
}
