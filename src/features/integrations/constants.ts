/**
 * Grenzen der Integrationen, gemeinsam für Dienste, Server Actions und Oberfläche.
 */
export const MAX_TOKENS_PER_USER = 5;
export const TOKEN_NAME_MAX_LENGTH = 40;
/** Größter CSV-Text, den der Server annimmt (Zeichen). */
export const CSV_MAX_LENGTH = 1_000_000;
/**
 * Größte Datei, die der Browser überhaupt einliest. Maßgeblich für das Absenden ist aber
 * `CSV_MAX_REQUEST_BYTES`: Je nach Inhalt wird der Text beim Übertragen größer.
 */
export const CSV_MAX_FILE_BYTES = 900_000;
/**
 * Server Actions nehmen höchstens 1 MB (1.048.576 Bytes) an. Der Text geht als JSON-Zeichenkette
 * in UTF-8 über die Leitung; Zeilenumbrüche und Anführungszeichen werden dabei maskiert und
 * zählen doppelt. Der Rest bis zur Grenze bleibt für die übrige Verpackung.
 */
export const CSV_MAX_REQUEST_BYTES = 1_000_000;

/** Bytes, die der CSV-Text in der Anfrage der Server Action belegt. */
export function csvRequestBytes(text: string): number {
  return new TextEncoder().encode(JSON.stringify(text)).length;
}
/** Pfad der Import-Route; die vollständige Adresse ergibt sich mit `APP_URL`. */
export const HEALTH_IMPORT_PATH = "/api/import/health";
