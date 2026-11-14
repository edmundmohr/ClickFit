import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("placeholders.progress");
  return { title: t("title") };
}

export default async function ProgressPage() {
  const t = await getTranslations("placeholders.progress");
  return (
    <>
      <PageHeader title={t("title")} />
      <ComingSoon title={t("title")} description={t("description")} illustration="progress" phase={4} />
    </>
  );
}
