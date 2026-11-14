/**
 * Begrenzt Passwortprüfungen außerhalb der Anmeldung (z. B. „aktuelles Passwort“ beim Ändern).
 * Nutzt dieselbe Tabelle wie das Rate-Limit von Better Auth (`rate_limit`), mit eigenem
 * Schlüssel-Präfix, damit sich beide nicht in die Quere kommen.
 */
import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { rateLimit } from "@/db/schema";
import { newId } from "@/lib/tokens";

export interface AttemptLimit {
  /** Länge des Zeitfensters ab dem ersten Versuch. */
  windowMs: number;
  /** So viele Versuche sind im Fenster erlaubt. */
  max: number;
}

/** Prüfung des aktuellen Passworts: fünf Versuche je Viertelstunde und Nutzer. */
export const PASSWORD_CHECK_LIMIT: AttemptLimit = { windowMs: 15 * 60 * 1000, max: 5 };

export const passwordCheckKey = (userId: string) => `clickfit:password-check:${userId}`;

/**
 * Zählt einen Versuch und meldet, ob er erlaubt ist. Das Hochzählen geschieht in einer
 * Anweisung, damit parallele Anfragen die Grenze nicht umgehen. Nach Ablauf des Fensters
 * beginnt die Zählung neu.
 */
export async function consumeAttempt(
  db: AppDatabase,
  key: string,
  limit: AttemptLimit,
  now = new Date(),
): Promise<boolean> {
  const at = now.getTime();
  const expired = sql`${at} - ${rateLimit.lastRequest} >= ${limit.windowMs}`;
  const [row] = await db
    .insert(rateLimit)
    .values({ id: newId(), key, count: 1, lastRequest: at })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${expired} then ${at} else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count });
  return (row?.count ?? 1) <= limit.max;
}

/** Nach einem erfolgreichen Versuch zählt die Vorgeschichte nicht mehr. */
export async function resetAttempts(db: AppDatabase, key: string): Promise<void> {
  await db.delete(rateLimit).where(eq(rateLimit.key, key));
}
