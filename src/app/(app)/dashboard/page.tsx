import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { DashboardEditor } from "@/features/dashboard/dashboard-editor";
import { getDashboardWidgets } from "@/features/progress/services/dashboard-service";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("progress.dashboard");
  return { title: t("title") };
}

export default async function DashboardSettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("progress.dashboard");
  const widgets = await getDashboardWidgets(getDb(), user.id);
  return (
    <>
      <Link href="/" className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={t("title")} description={t("hint")} />
      <DashboardEditor key={widgets.map((widget) => `${widget.id}${widget.visible}`).join()} initial={widgets} />
    </>
  );
}
