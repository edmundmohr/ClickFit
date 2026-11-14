/**
 * Schickt eine Push-Nachricht ohne Inhalt an ein Gerät. Der Service Worker weiß selbst, was
 * er anzeigt; so muss nichts verschlüsselt werden und es verlässt kein Inhalt den Server.
 */
import { createVapidToken, type VapidKeys } from "./vapid";

/**
 * Push-Dienste der Browser. Der Endpunkt kommt vom Gerät; ohne diese Liste könnte ein
 * manipuliertes Abo den Server Anfragen an beliebige Adressen schicken lassen.
 */
const ALLOWED_HOST_SUFFIXES = [
  ".push.apple.com",
  ".googleapis.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.username === "" &&
      ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
    );
  } catch {
    return false;
  }
}

export const PUSH_OUTCOMES = ["sent", "gone", "failed"] as const;
/** `gone` = das Abo gibt es nicht mehr und kann gelöscht werden. */
export type PushOutcome = (typeof PUSH_OUTCOMES)[number];

export interface SendPushInput {
  endpoint: string;
  keys: VapidKeys;
  subject: string;
  /** Wie lange der Push-Dienst die Nachricht höchstens aufbewahrt, wenn das Gerät nicht erreichbar ist. */
  ttlSeconds: number;
  fetcher?: typeof fetch;
  now?: Date;
}

export async function sendPush(input: SendPushInput): Promise<PushOutcome> {
  if (!isAllowedPushEndpoint(input.endpoint)) return "gone";
  const token = await createVapidToken({
    audience: new URL(input.endpoint).origin,
    subject: input.subject,
    keys: input.keys,
    now: input.now,
  });
  try {
    const response = await (input.fetcher ?? fetch)(input.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${token}, k=${input.keys.publicKey}`,
        TTL: String(input.ttlSeconds),
        Urgency: "high",
        "Content-Length": "0",
      },
    });
    if (response.status === 404 || response.status === 410) return "gone";
    return response.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
