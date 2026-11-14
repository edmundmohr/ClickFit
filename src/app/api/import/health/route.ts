import { parseHealthPayload } from "@/domain/health-import";
import { HealthImportError } from "@/domain/health-import/types";
import { applyHealthImport } from "@/features/integrations/services/import-service";
import { authenticateToken } from "@/features/integrations/services/token-service";
import { getDb } from "@/lib/server/context";

const NO_STORE = { "Cache-Control": "no-store" };
/** Größter angenommener JSON-Körper. */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

const unauthorized = () => json({ error: "UNAUTHORIZED" }, 401, { "WWW-Authenticate": "Bearer" });

function bearerToken(request: Request): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") ?? "");
  return match?.[1] ?? null;
}

/** Liest den Körper als Text und bricht ab, sobald er die Grenze überschreitet (`null`). */
async function readBody(request: Request, maxBytes: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * Health-Import von außen (z. B. „Health Auto Export“ oder Home Assistant).
 * Anmeldung nur über `Authorization: Bearer <Token>`; Cookies spielen keine Rolle.
 * In die Logs gehen weder Token noch Nutzdaten.
 */
export async function POST(request: Request): Promise<Response> {
  const token = bearerToken(request);
  if (!token) return unauthorized();
  const db = getDb();
  const userId = await authenticateToken(db, token);
  if (!userId) return unauthorized();

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);
  const text = await readBody(request, MAX_BODY_BYTES);
  if (text === null) return json({ error: "PAYLOAD_TOO_LARGE" }, 413);

  const body = parseJson(text);
  if (!body.ok) return json({ error: "IMPORT_INVALID" }, 400);
  const now = new Date();
  try {
    const result = await applyHealthImport(db, userId, parseHealthPayload(body.value, now), "api", now);
    return json(result);
  } catch (error) {
    if (error instanceof HealthImportError) return json({ error: "IMPORT_INVALID", reason: error.reason }, 400);
    // Nur die Art des Fehlers: Meldungen der Datenbank können gebundene Werte enthalten.
    console.error("Health import failed:", error instanceof Error ? error.name : "unknown");
    return json({ error: "UNKNOWN" }, 500);
  }
}
