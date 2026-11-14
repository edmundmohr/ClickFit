import type { VapidKeys } from "./vapid";

export interface PushEnvironment {
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  APP_URL: string;
}

/** Schlüssel und Absender für Web Push; `null`, wenn Push nicht eingerichtet ist. */
export function pushConfigOf(env: PushEnvironment): { keys: VapidKeys; subject: string } | null {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    keys: { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
    // Als Kontakt dient die Adresse der App, keine persönliche E-Mail-Adresse.
    subject: env.APP_URL,
  };
}
