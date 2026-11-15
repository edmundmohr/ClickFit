/**
 * KI-Auswertung aller Daten: lädt den Datenstand, fragt das Modell und speichert die geprüfte
 * Antwort. Pro Nutzer bleibt nur die jüngste Auswertung erhalten.
 */
import { eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { aiReview } from "@/db/schema";
import { formatDataContext } from "@/domain/ai/data-context";
import { MAX_REVIEW_QUESTION_LENGTH, normalizeReview, type AiReview, type RawReview } from "@/domain/ai/review";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import type { LlmProvider } from "@/lib/llm";
import { REVIEW_SYSTEM_PROMPT, reviewSchema } from "../prompts";
import { claimAiRequest, unwrapLlmResult } from "./ai-service";
import { loadAiSnapshot } from "./data-snapshot";

export interface AiReviewView {
  question: string | null;
  review: AiReview;
  createdAt: Date;
}

/** Der Text, der an das Modell geht: alle Daten und, falls gestellt, die Frage. */
export function buildReviewPrompt(dataContext: string, question: string | null): string {
  return [
    `Daten der Person:\n${dataContext}`,
    question ? `Frage der Person:\n"""${question}"""` : "Die Person hat keine eigene Frage gestellt.",
  ].join("\n\n");
}

/** Erstellt eine neue Auswertung und ersetzt die bisherige. */
export async function createReview(
  db: AppDatabase,
  provider: LlmProvider | null,
  userId: string,
  question: string | null,
  today: LocalDate,
  now = new Date(),
): Promise<AiReviewView> {
  const asked = question?.trim().slice(0, MAX_REVIEW_QUESTION_LENGTH) || null;
  const snapshot = await loadAiSnapshot(db, userId, today, now);
  const llm = await claimAiRequest(db, provider, userId, today);
  const { data, model } = unwrapLlmResult(
    await llm.generate({
      system: REVIEW_SYSTEM_PROMPT,
      prompt: buildReviewPrompt(formatDataContext(snapshot), asked),
      schema: reviewSchema,
      effort: "medium",
    }),
  );
  const review = normalizeReview(data, asked !== null);
  if (!review) throw new AppError("AI_FAILED");
  await db
    .insert(aiReview)
    .values({ userId, question: asked, content: review, model, createdAt: now })
    .onConflictDoUpdate({ target: aiReview.userId, set: { question: asked, content: review, model, createdAt: now } });
  return { question: asked, review, createdAt: now };
}

/** Die gespeicherte Auswertung, erneut geprüft; `null`, wenn es keine gibt. */
export async function getLatestReview(db: AppDatabase, userId: string): Promise<AiReviewView | null> {
  const row = await db.query.aiReview.findFirst({ where: eq(aiReview.userId, userId) });
  if (!row) return null;
  const content: RawReview = row.content;
  const review = normalizeReview(content, row.question !== null);
  return review ? { question: row.question, review, createdAt: row.createdAt } : null;
}

export async function deleteReview(db: AppDatabase, userId: string): Promise<void> {
  await db.delete(aiReview).where(eq(aiReview.userId, userId));
}
