/**
 * Gemeinsames Gerüst der Push-Routen: Anmeldung, Herkunft, Eingabeprüfung und Fehlerantworten.
 */
import type { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { getCurrentUser } from "@/features/auth/session";
import { AppError } from "@/lib/errors";
import { getDb, getEnv } from "@/lib/server/context";
import { isSameOrigin } from "@/lib/server/same-origin";

const NO_STORE = { "Cache-Control": "no-store" };

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export interface PushRequestContext<T> {
  db: AppDatabase;
  env: CloudflareEnv;
  userId: string;
  input: T;
}

/** Führt eine Push-Route aus; `schema` prüft den JSON-Körper. */
export async function handlePushRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
  task: (context: PushRequestContext<T>) => Promise<Response>,
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED" }, 401);
  if (!isSameOrigin(request)) return json({ error: "FORBIDDEN" }, 403);
  const body: unknown = await request.json().catch(() => null);
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) return json({ error: "VALIDATION" }, 400);
  try {
    return await task({ db: getDb(), env: getEnv(), userId: user.id, input: parsed.data });
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.code }, 400);
    console.error("Push request failed:", error);
    return json({ error: "UNKNOWN" }, 500);
  }
}
