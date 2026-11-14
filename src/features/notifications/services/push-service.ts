/**
 * Push-Abos der Geräte und die Benachrichtigung am Ende der Pause.
 *
 * Ablauf: Geht die App während einer Pause in den Hintergrund, meldet sie das Ende der Pause.
 * Der Server merkt sich die Pause und legt eine Nachricht mit passender Verzögerung in eine
 * Cloudflare-Queue. Kommt die Nachricht an und gilt die Pause noch, geht der Push hinaus.
 */
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { pushSubscription, restTimer } from "@/db/schema";
import { isAllowedPushEndpoint, sendPush, type PushOutcome } from "@/lib/push/send";
import type { VapidKeys } from "@/lib/push/vapid";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/tokens";

export interface SubscriptionInput {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Mehr Geräte pro Nutzer werden nicht gespeichert; das älteste Abo fällt heraus. */
export const MAX_SUBSCRIPTIONS_PER_USER = 5;

export async function saveSubscription(
  db: AppDatabase,
  userId: string,
  input: SubscriptionInput,
  now = new Date(),
): Promise<void> {
  if (!isAllowedPushEndpoint(input.endpoint)) throw new AppError("VALIDATION");
  // Ein Endpunkt gehört genau einem Gerät: Meldet sich dort ein anderer Nutzer an, wechselt das Abo.
  await db
    .insert(pushSubscription)
    .values({ id: newId(), userId, ...input, createdAt: now })
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: { userId, p256dh: input.p256dh, auth: input.auth, createdAt: now },
    });
  const all = await db.query.pushSubscription.findMany({
    where: eq(pushSubscription.userId, userId),
    orderBy: (table, { desc }) => desc(table.createdAt),
  });
  for (const extra of all.slice(MAX_SUBSCRIPTIONS_PER_USER)) {
    await db.delete(pushSubscription).where(eq(pushSubscription.id, extra.id));
  }
}

export async function deleteSubscription(db: AppDatabase, userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
}

export async function countSubscriptions(db: AppDatabase, userId: string): Promise<number> {
  return (await db.query.pushSubscription.findMany({ where: eq(pushSubscription.userId, userId) })).length;
}

export interface PushConfig {
  keys: VapidKeys;
  /** Kontakt für die Push-Dienste: die Adresse der App. */
  subject: string;
  fetcher?: typeof fetch;
}

/** Schickt einen Push an alle Geräte des Nutzers und räumt abgelaufene Abos auf. */
export async function pushToUser(
  db: AppDatabase,
  userId: string,
  config: PushConfig,
  ttlSeconds: number,
): Promise<Record<PushOutcome, number>> {
  const subscriptions = await db.query.pushSubscription.findMany({ where: eq(pushSubscription.userId, userId) });
  const outcome: Record<PushOutcome, number> = { sent: 0, gone: 0, failed: 0 };
  for (const subscription of subscriptions) {
    const result = await sendPush({ endpoint: subscription.endpoint, ttlSeconds, ...config });
    outcome[result]++;
    if (result === "gone") await db.delete(pushSubscription).where(eq(pushSubscription.id, subscription.id));
  }
  return outcome;
}

export interface RestTimerMessage {
  userId: string;
  token: string;
}

/** Der Teil einer Cloudflare-Queue, den der Dienst braucht (erleichtert das Testen). */
export interface DelayedQueue {
  send: (message: RestTimerMessage, options: { delaySeconds: number }) => Promise<unknown>;
}

/** Längere Pausen plant die App nicht; schützt die Queue vor unsinnigen Werten. */
export const MAX_REST_SECONDS = 30 * 60;
/** Eine Benachrichtigung, die später als so viele Sekunden käme, wäre nur noch störend. */
export const REST_PUSH_TTL_SECONDS = 60;

/** Plant die Benachrichtigung für das Ende der Pause; ersetzt eine frühere Planung. */
export async function scheduleRestTimer(
  db: AppDatabase,
  queue: DelayedQueue,
  userId: string,
  endsAt: Date,
  now = new Date(),
): Promise<void> {
  const delaySeconds = Math.ceil((endsAt.getTime() - now.getTime()) / 1000);
  if (delaySeconds < 0 || delaySeconds > MAX_REST_SECONDS) throw new AppError("VALIDATION");
  const token = newId();
  await db
    .insert(restTimer)
    .values({ userId, token, endsAt })
    .onConflictDoUpdate({ target: restTimer.userId, set: { token, endsAt } });
  await queue.send({ userId, token }, { delaySeconds });
}

/** Die App ist wieder im Vordergrund oder die Pause wurde beendet: keine Benachrichtigung mehr. */
export async function cancelRestTimer(db: AppDatabase, userId: string): Promise<void> {
  await db.delete(restTimer).where(eq(restTimer.userId, userId));
}

/**
 * Verarbeitet eine Nachricht aus der Queue. Der Push geht nur hinaus, wenn die Pause noch
 * genau die geplante ist; eine abgebrochene oder ersetzte Pause bleibt stumm.
 */
export async function deliverRestTimer(
  db: AppDatabase,
  message: RestTimerMessage,
  config: PushConfig,
): Promise<"sent" | "stale"> {
  const [claimed] = await db
    .delete(restTimer)
    .where(and(eq(restTimer.userId, message.userId), eq(restTimer.token, message.token)))
    .returning({ userId: restTimer.userId });
  if (!claimed) return "stale";
  await pushToUser(db, message.userId, config, REST_PUSH_TTL_SECONDS);
  return "sent";
}
