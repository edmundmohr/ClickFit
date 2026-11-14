/**
 * Führt Vorgänge aus der Offline-Warteschlange aus. Jeder Vorgang wird höchstens einmal
 * angewendet, auch wenn das Gerät ihn mehrfach schickt.
 */
import { and, eq, lt } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { syncOperation } from "@/db/schema";
import {
  MAX_OPERATION_AGE_MS,
  operationTime,
  syncOperationSchema,
  type SyncOperation,
  type SyncResult,
} from "@/domain/sync/operations";
import { deleteSet, finishWorkout, saveSessionNote, saveSet } from "@/features/training/services/workout-service";
import { AppError } from "@/lib/errors";

async function apply(db: AppDatabase, userId: string, operation: SyncOperation, now: Date): Promise<void> {
  const at = operationTime(operation.at, now);
  switch (operation.type) {
    case "set.save":
      return saveSet(db, userId, operation.payload, at);
    case "set.delete":
      return deleteSet(db, userId, operation.payload.setId);
    case "workout.finish":
      return finishWorkout(db, userId, operation.payload.sessionId, at);
    case "workout.note":
      return saveSessionNote(db, userId, operation.payload.sessionId, operation.payload.note);
  }
}

function rawId(input: unknown): string {
  return typeof input === "object" && input !== null && "id" in input && typeof input.id === "string"
    ? input.id.slice(0, 80)
    : "";
}

/** Verarbeitet die Vorgänge in der Reihenfolge, in der das Gerät sie geschickt hat. */
export async function processOperations(
  db: AppDatabase,
  userId: string,
  inputs: readonly unknown[],
  now = new Date(),
): Promise<SyncResult[]> {
  const results: SyncResult[] = [];
  for (const input of inputs) {
    const parsed = syncOperationSchema.safeParse(input);
    if (!parsed.success) {
      results.push({ id: rawId(input), status: "rejected" });
      continue;
    }
    const operation = parsed.data;
    const seen = await db.query.syncOperation.findFirst({
      where: and(eq(syncOperation.userId, userId), eq(syncOperation.id, operation.id)),
    });
    if (seen) {
      results.push({ id: operation.id, status: "duplicate" });
      continue;
    }
    try {
      await apply(db, userId, operation, now);
      await db.insert(syncOperation).values({ userId, id: operation.id, processedAt: now }).onConflictDoNothing();
      results.push({ id: operation.id, status: "ok" });
    } catch (error) {
      if (error instanceof AppError) {
        // Fachlich abgelehnt (z. B. Training gelöscht oder fremd): erneutes Senden hilft nicht.
        results.push({ id: operation.id, status: "rejected" });
      } else {
        console.error("Sync operation failed:", error);
        results.push({ id: operation.id, status: "retry" });
      }
    }
  }
  return results;
}

/** Entfernt Merker für Vorgänge, die so alt sind, dass kein Gerät sie mehr erneut schickt. */
export async function pruneProcessedOperations(db: AppDatabase, now = new Date()): Promise<void> {
  await db.delete(syncOperation).where(lt(syncOperation.processedAt, new Date(now.getTime() - 2 * MAX_OPERATION_AGE_MS)));
}
