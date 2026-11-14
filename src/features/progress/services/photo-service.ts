/**
 * Fortschrittsfotos: Die Dateien liegen im privaten R2-Bucket, die Metadaten in D1.
 * Ausgeliefert wird nur über die App nach Prüfung des Besitzers.
 */
import { and, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { progressPhoto, workoutSession } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";

export const PHOTO_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export interface PhotoView {
  id: string;
  date: LocalDate;
  note: string | null;
  sessionId: string | null;
}

export interface PhotoUpload {
  data: ArrayBuffer;
  contentType: string;
  date: LocalDate;
  note: string;
  sessionId: string | null;
}

export async function uploadPhoto(db: AppDatabase, bucket: R2Bucket, userId: string, input: PhotoUpload): Promise<string> {
  const allowed: readonly string[] = PHOTO_CONTENT_TYPES;
  if (!allowed.includes(input.contentType) || input.data.byteLength === 0 || input.data.byteLength > PHOTO_MAX_BYTES) {
    throw new AppError("VALIDATION");
  }
  let sessionId: string | null = null;
  if (input.sessionId) {
    // Ein Foto lässt sich nur einem eigenen Training zuordnen.
    const session = await db.query.workoutSession.findFirst({
      columns: { id: true },
      where: and(eq(workoutSession.id, input.sessionId), eq(workoutSession.userId, userId)),
    });
    if (!session) throw new AppError("NOT_FOUND");
    sessionId = session.id;
  }

  const id = newId();
  const r2Key = `photos/${userId}/${id}`;
  await bucket.put(r2Key, input.data, { httpMetadata: { contentType: input.contentType } });
  try {
    await db.insert(progressPhoto).values({
      id,
      userId,
      date: input.date,
      r2Key,
      contentType: input.contentType,
      sizeBytes: input.data.byteLength,
      note: input.note.trim() || null,
      sessionId,
      createdAt: new Date(),
    });
  } catch (error) {
    await bucket.delete(r2Key);
    throw error;
  }
  return id;
}

export async function listPhotos(db: AppDatabase, userId: string): Promise<PhotoView[]> {
  return db.query.progressPhoto.findMany({
    columns: { id: true, date: true, note: true, sessionId: true },
    where: eq(progressPhoto.userId, userId),
    orderBy: [desc(progressPhoto.date), desc(progressPhoto.createdAt)],
  });
}

async function getOwnedPhoto(db: AppDatabase, userId: string, photoId: string) {
  const row = await db.query.progressPhoto.findFirst({
    where: and(eq(progressPhoto.id, photoId), eq(progressPhoto.userId, userId)),
  });
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** Bilddaten eines eigenen Fotos; `null`, wenn die Datei im Bucket fehlt. */
export async function getPhotoFile(
  db: AppDatabase,
  bucket: R2Bucket,
  userId: string,
  photoId: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  const row = await getOwnedPhoto(db, userId, photoId);
  const object = await bucket.get(row.r2Key);
  return object ? { body: object.body, contentType: row.contentType } : null;
}

export async function deletePhoto(db: AppDatabase, bucket: R2Bucket, userId: string, photoId: string): Promise<void> {
  const row = await getOwnedPhoto(db, userId, photoId);
  await bucket.delete(row.r2Key);
  await db.delete(progressPhoto).where(eq(progressPhoto.id, photoId));
}
