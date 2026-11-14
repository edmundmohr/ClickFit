/**
 * Vorgänge der Offline-Warteschlange. Das Gerät speichert sie in IndexedDB und überträgt sie,
 * sobald wieder eine Verbindung besteht. Reine Typen und Regeln ohne Framework.
 */
import { z } from "zod";
import { SET_TYPES } from "@/domain/training/types";

const id = z.string().min(1).max(80);
const isoInstant = z.iso.datetime();

/** Gleiche Regeln wie beim direkten Speichern eines Satzes. */
export const setPayloadSchema = z.object({
  id: z.uuid(),
  workoutExerciseId: id,
  position: z.number().int().min(0).max(99),
  type: z.enum(SET_TYPES),
  weightKg: z.number().min(0).max(2000).nullable(),
  reps: z.number().int().min(0).max(100000).nullable(),
  rir: z.number().int().min(0).max(10).nullable(),
  note: z.string().trim().max(300).nullable(),
  completed: z.boolean(),
});

const base = { id: z.uuid(), at: isoInstant };

export const syncOperationSchema = z.discriminatedUnion("type", [
  z.object({ ...base, type: z.literal("set.save"), payload: setPayloadSchema }),
  z.object({ ...base, type: z.literal("set.delete"), payload: z.object({ setId: z.uuid() }) }),
  z.object({ ...base, type: z.literal("workout.finish"), payload: z.object({ sessionId: id }) }),
  z.object({
    ...base,
    type: z.literal("workout.note"),
    payload: z.object({ sessionId: id, note: z.string().max(500) }),
  }),
]);
export type SyncOperation = z.infer<typeof syncOperationSchema>;
export type SyncOperationType = SyncOperation["type"];

export const MAX_OPERATIONS_PER_REQUEST = 50;

export const syncRequestSchema = z.object({
  // Jeder Vorgang wird einzeln geprüft: Ein fehlerhafter soll die übrigen nicht blockieren.
  operations: z.array(z.unknown()).min(1).max(MAX_OPERATIONS_PER_REQUEST),
});

/**
 * - ok: ausgeführt
 * - duplicate: war schon ausgeführt, nichts zu tun
 * - rejected: dauerhaft abgelehnt (ungültig oder gehört dem Nutzer nicht); das Gerät verwirft ihn
 * - retry: vorübergehender Fehler; das Gerät versucht es später erneut
 */
export const SYNC_STATUSES = ["ok", "duplicate", "rejected", "retry"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export interface SyncResult {
  id: string;
  status: SyncStatus;
}

/** Vorgänge, bei denen nur der letzte Stand zählt, teilen sich einen Schlüssel in der Warteschlange. */
export function queueKey(operation: SyncOperation): string {
  switch (operation.type) {
    case "set.save":
      return `set:${operation.payload.id}`;
    case "set.delete":
      return `set:${operation.payload.setId}`;
    case "workout.note":
      return `note:${operation.payload.sessionId}`;
    case "workout.finish":
      return `finish:${operation.payload.sessionId}`;
  }
}

/** So lange zurück darf der Zeitpunkt eines Offline-Vorgangs höchstens liegen. */
export const MAX_OPERATION_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Zeitpunkt, zu dem der Vorgang auf dem Gerät passiert ist. Liegt die Geräteuhr in der Zukunft
 * oder ist der Vorgang sehr alt, gilt die Serverzeit.
 */
export function operationTime(at: string, now: Date): Date {
  const time = new Date(at).getTime();
  if (!Number.isFinite(time)) return now;
  if (time > now.getTime() + CLOCK_TOLERANCE_MS) return now;
  if (time < now.getTime() - MAX_OPERATION_AGE_MS) return now;
  return new Date(Math.min(time, now.getTime()));
}
