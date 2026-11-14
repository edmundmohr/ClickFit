/**
 * Erkennt am Ergebnis einer Seitenanfrage, dass niemand angemeldet ist: Der Server liefert die
 * Anmeldeseite (direkt oder nach einer Umleitung), z. B. nach Ablauf der Sitzung oder einem
 * Passwort-Reset. Ohne Abhängigkeit vom Service Worker, damit es testbar bleibt.
 */
export const LOGIN_PATH = "/login";

export function showsLogin(responseUrl: string): boolean {
  if (!responseUrl) return false;
  try {
    const path = new URL(responseUrl).pathname;
    return path === LOGIN_PATH || path.startsWith(`${LOGIN_PATH}/`);
  } catch {
    return false;
  }
}
