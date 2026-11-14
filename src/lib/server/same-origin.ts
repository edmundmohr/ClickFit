/**
 * Schutz vor Anfragen fremder Seiten für eigene Route-Handler: Der Browser sendet die Herkunft
 * bei jedem verändernden Request mit. Fehlt sie (z. B. bei Werkzeugen ohne Browser), entscheidet
 * allein die Sitzung.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}
