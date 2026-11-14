import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { CsvImportCard } from "@/features/integrations/components/csv-import-card";
import { HealthAutoExportCard, HomeAssistantCard } from "@/features/integrations/components/guide-cards";
import { TokenCard } from "@/features/integrations/components/token-card";
import { importEndpoint } from "@/features/integrations/endpoint";
import { listTokens } from "@/features/integrations/services/token-service";
import { getDb, getEnv } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("integrations");
  return { title: t("title") };
}

export default async function IntegrationsPage() {
  const user = await requireUser();
  const t = await getTranslations("integrations");
  const tokens = await listTokens(getDb(), user.id);
  const endpoint = importEndpoint(getEnv().APP_URL);
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-6">
        <TokenCard tokens={tokens} />
        <HealthAutoExportCard endpoint={endpoint} />
        <HomeAssistantCard endpoint={endpoint} />
        <CsvImportCard />
      </div>
    </>
  );
}
