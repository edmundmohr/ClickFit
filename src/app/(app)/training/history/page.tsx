import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Illustration } from "@/components/illustration";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { SessionList } from "@/features/training/components/session-list";
import { listCompletedSessions } from "@/features/training/services/history-service";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("training.history");
  return { title: t("title") };
}

export default async function HistoryPage() {
  const user = await requireUser();
  const t = await getTranslations("training.history");
  const sessions = await listCompletedSessions(getDb(), user.id);
  return (
    <>
      <PageHeader title={t("title")} />
      {sessions.length === 0 ? (
        <div className="grid gap-4">
          <Illustration name="calendar" />
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        </div>
      ) : (
        <SessionList sessions={sessions} unitSystem={user.unitSystem} />
      )}
    </>
  );
}
