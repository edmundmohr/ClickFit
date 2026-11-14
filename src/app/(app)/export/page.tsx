import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { DownloadIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/features/auth/session";
import { ExportForm } from "@/features/export/components/export-form";
import { toLocalDate } from "@/lib/dates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("export");
  return { title: t("title") };
}

export default async function ExportPage() {
  await requireUser();
  const t = await getTranslations("export");
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6">
        <Card>
          <CardContent>
            <ExportForm today={toLocalDate(new Date())} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("full.title")}</CardTitle>
            <CardDescription>{t("full.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <a href="/api/me/export" download>
                <DownloadIcon aria-hidden />
                {t("full.download")}
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
