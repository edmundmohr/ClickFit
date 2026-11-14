/**
 * Körperfett-Schätzung aus einem Fortschrittsfoto über den KI-Anbieter. Das Ergebnis ist eine
 * grobe Spanne und wird überall als Schätzung gekennzeichnet.
 */
import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { bodyFatEstimate, bodyWeightEntry, progressPhoto, userProfile } from "@/db/schema";
import { normalizeBodyFatEstimate } from "@/domain/ai/body-fat";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import { LLM_IMAGE_TYPES, type LlmImageType } from "@/lib/llm/types";
import type { LlmProvider } from "@/lib/llm";
import { newId } from "@/lib/tokens";
import { BODY_FAT_SYSTEM_PROMPT, bodyFatSchema } from "../prompts";
import { claimAiRequest, unwrapLlmResult } from "./ai-service";

/** Größere Bilder nimmt der Anbieter nicht an. Fotos werden beim Hochladen ohnehin verkleinert. */
const MAX_IMAGE_BYTES = 4_500_000;
const BASE64_CHUNK = 0x8000;

export interface BodyFatEstimateView {
  id: string;
  photoId: string;
  date: LocalDate;
  lowPercent: number;
  highPercent: number;
  note: string | null;
}

export type BodyFatOutcome =
  | { status: "estimated"; estimate: BodyFatEstimateView }
  /** Das Foto reicht für eine Schätzung nicht aus; `note` erklärt, was fehlt. */
  | { status: "not_possible"; note: string };

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(index, index + BASE64_CHUNK));
  }
  return btoa(binary);
}

function isImageType(value: string): value is LlmImageType {
  return (LLM_IMAGE_TYPES as readonly string[]).includes(value);
}

/** Angaben aus dem Profil, die die Schätzung verbessern. Kein Name, kein Benutzername. */
async function describePerson(db: AppDatabase, userId: string, today: LocalDate): Promise<string> {
  const [profile, weight] = await Promise.all([
    db.query.userProfile.findFirst({ where: eq(userProfile.userId, userId) }),
    db.query.bodyWeightEntry.findFirst({ where: eq(bodyWeightEntry.userId, userId), orderBy: desc(bodyWeightEntry.date) }),
  ]);
  if (!profile) return "Zur Person liegen keine Angaben vor.";
  const age = Number(today.slice(0, 4)) - profile.birthYear;
  const kg = weight?.weightKg ?? profile.weightKg;
  return `Angaben der Person: Geschlecht ${profile.sex === "female" ? "weiblich" : "männlich"}, etwa ${age} Jahre, ${Math.round(profile.heightCm)} cm, ${Math.round(kg)} kg.`;
}

export async function estimateBodyFat(
  db: AppDatabase,
  bucket: R2Bucket,
  provider: LlmProvider | null,
  userId: string,
  photoId: string,
  today: LocalDate,
  now = new Date(),
): Promise<BodyFatOutcome> {
  const photo = await db.query.progressPhoto.findFirst({
    where: and(eq(progressPhoto.id, photoId), eq(progressPhoto.userId, userId)),
  });
  if (!photo) throw new AppError("NOT_FOUND");
  if (!isImageType(photo.contentType) || photo.sizeBytes > MAX_IMAGE_BYTES) throw new AppError("VALIDATION");
  const object = await bucket.get(photo.r2Key);
  if (!object) throw new AppError("NOT_FOUND");

  const llm = await claimAiRequest(db, provider, userId, today);
  const { data, model } = unwrapLlmResult(
    await llm.generate({
      system: BODY_FAT_SYSTEM_PROMPT,
      prompt: `${await describePerson(db, userId, today)}\nSchätze den Körperfettanteil auf dem Foto.`,
      images: [{ mediaType: photo.contentType, base64: toBase64(new Uint8Array(await object.arrayBuffer())) }],
      schema: bodyFatSchema,
      effort: "medium",
    }),
  );
  const range = normalizeBodyFatEstimate(data);
  if (!range) return { status: "not_possible", note: data.note.trim().slice(0, 400) };

  const id = newId();
  await db.batch([
    // Pro Foto gibt es eine Schätzung: Eine neue ersetzt die alte.
    db.delete(bodyFatEstimate).where(and(eq(bodyFatEstimate.userId, userId), eq(bodyFatEstimate.photoId, photoId))),
    db.insert(bodyFatEstimate).values({
      id,
      userId,
      photoId,
      date: photo.date,
      lowPercent: range.lowPercent,
      highPercent: range.highPercent,
      note: range.note || null,
      model,
      createdAt: now,
    }),
  ]);
  return {
    status: "estimated",
    estimate: { id, photoId, date: photo.date, lowPercent: range.lowPercent, highPercent: range.highPercent, note: range.note || null },
  };
}

export async function listBodyFatEstimates(db: AppDatabase, userId: string): Promise<BodyFatEstimateView[]> {
  return db.query.bodyFatEstimate.findMany({
    columns: { id: true, photoId: true, date: true, lowPercent: true, highPercent: true, note: true },
    where: eq(bodyFatEstimate.userId, userId),
    orderBy: desc(bodyFatEstimate.date),
  });
}

export async function deleteBodyFatEstimate(db: AppDatabase, userId: string, estimateId: string): Promise<void> {
  const deleted = await db
    .delete(bodyFatEstimate)
    .where(and(eq(bodyFatEstimate.id, estimateId), eq(bodyFatEstimate.userId, userId)))
    .returning({ id: bodyFatEstimate.id });
  if (deleted.length === 0) throw new AppError("NOT_FOUND");
}
