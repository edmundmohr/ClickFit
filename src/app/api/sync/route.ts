import { syncRequestSchema } from "@/domain/sync/operations";
import { getCurrentUser } from "@/features/auth/session";
import { processOperations, pruneProcessedOperations } from "@/features/sync/services/sync-service";
import { getDb } from "@/lib/server/context";
import { isSameOrigin } from "@/lib/server/same-origin";

const NO_STORE = { "Cache-Control": "no-store" };

/** Nimmt Vorgänge aus der Offline-Warteschlange eines Geräts entgegen. */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "UNAUTHORIZED" }, { status: 401, headers: NO_STORE });
  if (!isSameOrigin(request)) return Response.json({ error: "FORBIDDEN" }, { status: 403, headers: NO_STORE });

  const body: unknown = await request.json().catch(() => null);
  const parsed = syncRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "VALIDATION" }, { status: 400, headers: NO_STORE });

  const db = getDb();
  const results = await processOperations(db, user.id, parsed.data.operations);
  await pruneProcessedOperations(db);
  return Response.json({ results }, { headers: NO_STORE });
}
