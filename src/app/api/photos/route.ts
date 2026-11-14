import { getCurrentUser } from "@/features/auth/session";
import { PHOTO_MAX_BYTES, uploadPhoto } from "@/features/progress/services/photo-service";
import { isValidLocalDate, toLocalDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { getDb, getEnv } from "@/lib/server/context";

const json = (body: { id?: string; error?: string }, status: number) => Response.json(body, { status });

/** Nimmt ein Fortschrittsfoto entgegen (multipart/form-data: file, date, note, sessionId). */
export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return json({ error: "UNAUTHORIZED" }, 401);
  // Schutz vor Anfragen fremder Seiten: Der Browser sendet die Herkunft bei jedem POST mit.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ error: "FORBIDDEN" }, 403);

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File) || file.size > PHOTO_MAX_BYTES) return json({ error: "VALIDATION" }, 400);
  const date = form.get("date");
  const note = form.get("note");
  const sessionId = form.get("sessionId");

  try {
    const id = await uploadPhoto(getDb(), getEnv().UPLOADS, user.id, {
      data: await file.arrayBuffer(),
      contentType: file.type,
      date: typeof date === "string" && isValidLocalDate(date) ? date : toLocalDate(new Date()),
      note: typeof note === "string" ? note.slice(0, 200) : "",
      sessionId: typeof sessionId === "string" && sessionId !== "" ? sessionId : null,
    });
    return json({ id }, 201);
  } catch (error) {
    if (error instanceof AppError) return json({ error: error.code }, error.code === "NOT_FOUND" ? 404 : 400);
    console.error("Photo upload failed:", error);
    return json({ error: "UNKNOWN" }, 500);
  }
}
