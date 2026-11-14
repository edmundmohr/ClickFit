import { getTranslations } from "next-intl/server";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";

export default async function TodayPage() {
  const user = await requireUser();
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("home.greeting", { name: user.name })} />
      <ComingSoon title={t("nav.today")} description={t("home.description")} phase={2} />
    </>
  );
}
