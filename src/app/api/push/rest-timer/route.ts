import { z } from "zod";
import { handlePushRequest, json } from "@/features/notifications/api";
import { cancelRestTimer, scheduleRestTimer } from "@/features/notifications/services/push-service";

/** `endsAt: null` nimmt eine geplante Benachrichtigung zurück. */
const restTimerSchema = z.object({ endsAt: z.iso.datetime().nullable() });

/** Plant die Benachrichtigung für das Ende der laufenden Pause oder nimmt sie zurück. */
export function POST(request: Request): Promise<Response> {
  return handlePushRequest(request, restTimerSchema, async ({ db, env, userId, input }) => {
    if (input.endsAt === null) await cancelRestTimer(db, userId);
    else await scheduleRestTimer(db, env.REST_TIMER_QUEUE, userId, new Date(input.endsAt));
    return json({ ok: true });
  });
}
