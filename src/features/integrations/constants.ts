/**
 * Grenzen der Integrationen, gemeinsam für Dienste, Server Actions und Oberfläche.
 */
export const MAX_TOKENS_PER_USER = 5;
export const TOKEN_NAME_MAX_LENGTH = 40;
/** Größter CSV-Text, den der Server annimmt (Zeichen). */
export const CSV_MAX_LENGTH = 1_000_000;
/**
 * Größte Datei, die der Browser abschickt: Server Actions nehmen samt Verpackung höchstens
 * 1 MB an, deshalb bleibt hier etwas Abstand.
 */
export const CSV_MAX_FILE_BYTES = 900_000;
/** Pfad der Import-Route; die vollständige Adresse ergibt sich mit `APP_URL`. */
export const HEALTH_IMPORT_PATH = "/api/import/health";
