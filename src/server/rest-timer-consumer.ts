/**
 * Verbraucher der Queue `clickfit-rest-timer`: Läuft außerhalb von Next.js direkt im Worker
 * (siehe `worker.ts`) und schickt die Benachrichtigung am Ende der Pause.
 */
import { createDb } from "@/db/client";
import { deliverRestTimer, type RestTimerMessage } from "@/features/notifications/services/push-service";
import { pushConfigOf, type PushEnvironment } from "@/lib/push/config";

export interface ConsumerEnvironment extends PushEnvironment {
  DB: D1Database;
}

export async function handleRestTimerBatch(
  batch: MessageBatch<RestTimerMessage>,
  env: ConsumerEnvironment,
): Promise<void> {
  const config = pushConfigOf(env);
  if (!config) {
    // Ohne Schlüssel kann nichts gesendet werden; erneutes Zustellen würde daran nichts ändern.
    batch.ackAll();
    return;
  }
  const db = createDb(env.DB);
  for (const message of batch.messages) {
    try {
      await deliverRestTimer(db, message.body, config);
      message.ack();
    } catch (error) {
      console.error("Rest timer push failed:", error);
      message.retry();
    }
  }
}
