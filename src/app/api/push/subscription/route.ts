import { z } from "zod";
import { handlePushRequest, json } from "@/features/notifications/api";
import { deleteSubscription, saveSubscription } from "@/features/notifications/services/push-service";

const key = z.string().min(10).max(200);
const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: key, auth: key }),
});

/** Speichert das Push-Abo dieses Geräts. */
export function POST(request: Request): Promise<Response> {
  return handlePushRequest(request, subscriptionSchema, async ({ db, userId, input }) => {
    await saveSubscription(db, userId, { endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth });
    return json({ ok: true }, 201);
  });
}

/** Entfernt das Push-Abo dieses Geräts. */
export function DELETE(request: Request): Promise<Response> {
  return handlePushRequest(request, z.object({ endpoint: z.url().max(1000) }), async ({ db, userId, input }) => {
    await deleteSubscription(db, userId, input.endpoint);
    return json({ ok: true });
  });
}
