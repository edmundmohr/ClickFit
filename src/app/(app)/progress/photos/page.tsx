import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { getAiStatus } from "@/features/ai/services/ai-service";
import { listBodyFatEstimates } from "@/features/ai/services/body-fat-service";
import { requireUser } from "@/features/auth/session";
import { PhotoGrid } from "@/features/progress/components/photo-grid";
import { PhotoUpload } from "@/features/progress/components/photo-upload";
import { listPhotos } from "@/features/progress/services/photo-service";
import { getPeriodSessions } from "@/features/progress/services/progress-service";
import { toLocalDate } from "@/lib/dates";
import { formatDayLong } from "@/lib/format";
import { getLlmProvider } from "@/lib/llm";
import { getDb, getEnv } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("progress.tabs");
  return { title: t("photos") };
}

export default async function ProgressPhotosPage({ searchParams }: PageProps<"/progress/photos">) {
  const user = await requireUser();
  const t = await getTranslations("progress.photos");
  const today = toLocalDate(new Date());
  const db = getDb();
  const params = await searchParams;
  const [photos, sessions, estimates, ai] = await Promise.all([
    listPhotos(db, user.id),
    getPeriodSessions(db, user.id, "2000-01-01", today),
    listBodyFatEstimates(db, user.id),
    getAiStatus(db, getLlmProvider(getEnv()), user.id, today),
  ]);
  const sessionDates = Object.fromEntries(sessions.map((session) => [session.id, session.date]));
  // Nur ein eigenes, abgeschlossenes Training lässt sich verknüpfen. Die Map prüft nur echte
  // Kennungen (`in` fände auch geerbte Eigenschaften wie `toString`).
  const sessionDateById = new Map(sessions.map((session) => [session.id, session.date]));
  const requested = typeof params.session === "string" ? params.session : "";
  const requestedDate = sessionDateById.get(requested);
  const sessionId = requestedDate === undefined ? null : requested;

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            {requestedDate !== undefined ? t("forSession", { date: formatDayLong(requestedDate) }) : t("hint")}
          </p>
          <PhotoUpload today={today} sessionId={sessionId} />
        </CardContent>
      </Card>
      {photos.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("empty")}</p>
      ) : (
        <PhotoGrid
          photos={photos}
          sessionDates={sessionDates}
          estimates={Object.fromEntries(estimates.map((estimate) => [estimate.photoId, estimate]))}
          ai={ai.available && ai.provider ? { enabled: ai.enabled, provider: ai.provider } : null}
        />
      )}
    </div>
  );
}
