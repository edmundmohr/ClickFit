import { z } from "zod";
import { handlePushRequest, json } from "@/features/notifications/api";
import { REST_PUSH_TTL_SECONDS, pushToUser } from "@/features/notifications/services/push-service";
import { pushConfigOf } from "@/lib/push/config";

/** Schickt sofort eine Test-Benachrichtigung an alle Geräte des angemeldeten Nutzers. */
export function POST(request: Request): Promise<Response> {
  return handlePushRequest(request, z.object({}), async ({ db, env, userId }) => {
    const config = pushConfigOf(env);
    if (!config) return json({ error: "NOT_CONFIGURED" }, 503);
    return json(await pushToUser(db, userId, config, REST_PUSH_TTL_SECONDS));
  });
}
