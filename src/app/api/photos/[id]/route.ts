import { getCurrentUser } from "@/features/auth/session";
import { getPhotoFile } from "@/features/progress/services/photo-service";
import { AppError } from "@/lib/errors";
import { getDb, getEnv } from "@/lib/server/context";

/** Liefert ein Fortschrittsfoto nur an seinen Besitzer aus. */
export async function GET(_request: Request, context: RouteContext<"/api/photos/[id]">): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { id } = await context.params;
  try {
    const file = await getPhotoFile(getDb(), getEnv().UPLOADS, user.id, id);
    if (!file) return new Response(null, { status: 404 });
    return new Response(file.body, {
      headers: {
        "Content-Type": file.contentType,
        // Private Bilder: nur im Browser des Nutzers zwischenspeichern, nie auf geteilten Caches.
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") return new Response(null, { status: 404 });
    throw error;
  }
}
