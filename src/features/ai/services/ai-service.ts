/**
 * Rahmen für alle KI-Funktionen: Zustimmung pro Nutzer, Tageslimit und Zugriff auf den Anbieter.
 * Ohne ausdrückliche Zustimmung verlässt nichts die App.
 */
import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { aiConsent, aiUsage } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import type { LlmProvider, LlmResult } from "@/lib/llm";

/** So viele KI-Anfragen darf ein Nutzer pro Tag stellen (Kostenbremse). */
export const AI_DAILY_LIMIT = 20;

export interface AiStatus {
  /** Auf dem Server ist ein KI-Anbieter eingerichtet. */
  available: boolean;
  /** Der Nutzer hat zugestimmt. */
  enabled: boolean;
  usedToday: number;
  dailyLimit: number;
  provider: string | null;
}

export async function hasAiConsent(db: AppDatabase, userId: string): Promise<boolean> {
  return (await db.query.aiConsent.findFirst({ where: eq(aiConsent.userId, userId) })) !== undefined;
}

export async function setAiConsent(db: AppDatabase, userId: string, enabled: boolean, now = new Date()): Promise<void> {
  if (enabled) {
    await db.insert(aiConsent).values({ userId, enabledAt: now }).onConflictDoNothing();
  } else {
    await db.delete(aiConsent).where(eq(aiConsent.userId, userId));
  }
}

async function usedOn(db: AppDatabase, userId: string, date: LocalDate): Promise<number> {
  const row = await db.query.aiUsage.findFirst({ where: and(eq(aiUsage.userId, userId), eq(aiUsage.date, date)) });
  return row?.count ?? 0;
}

export async function getAiStatus(
  db: AppDatabase,
  provider: LlmProvider | null,
  userId: string,
  today: LocalDate,
): Promise<AiStatus> {
  const [enabled, usedToday] = await Promise.all([hasAiConsent(db, userId), usedOn(db, userId, today)]);
  return {
    available: provider !== null,
    enabled,
    usedToday,
    dailyLimit: AI_DAILY_LIMIT,
    provider: provider?.name ?? null,
  };
}

/**
 * Prüft, ob der Nutzer die KI gerade nutzen darf, und zählt die Anfrage. Wirft, wenn kein
 * Anbieter eingerichtet ist, die Zustimmung fehlt oder das Tageslimit erreicht ist.
 */
export async function claimAiRequest(
  db: AppDatabase,
  provider: LlmProvider | null,
  userId: string,
  today: LocalDate,
): Promise<LlmProvider> {
  if (!provider) throw new AppError("AI_UNAVAILABLE");
  if (!(await hasAiConsent(db, userId))) throw new AppError("AI_DISABLED");
  // Erst zählen, dann prüfen: So können zwei gleichzeitige Anfragen das Limit nicht unterlaufen.
  const [row] = await db
    .insert(aiUsage)
    .values({ userId, date: today, count: 1 })
    .onConflictDoUpdate({ target: [aiUsage.userId, aiUsage.date], set: { count: sql`${aiUsage.count} + 1` } })
    .returning({ count: aiUsage.count });
  if ((row?.count ?? 0) > AI_DAILY_LIMIT) throw new AppError("AI_LIMIT");
  return provider;
}

/** Wandelt das Ergebnis des Anbieters in Daten oder einen passenden Fehler um. */
export function unwrapLlmResult<T>(result: LlmResult<T>): { data: T; model: string } {
  switch (result.status) {
    case "ok":
      return { data: result.data, model: result.model };
    case "refused":
      throw new AppError("AI_REFUSED");
    case "unavailable":
      throw new AppError("AI_UNAVAILABLE");
    case "failed":
      throw new AppError("AI_FAILED");
  }
}
