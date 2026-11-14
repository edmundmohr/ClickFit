import { getTranslations } from "next-intl/server";
import { SectionTabs } from "@/components/layout/section-tabs";

export default async function ProgressLayout({ children }: LayoutProps<"/progress">) {
  const t = await getTranslations("progress.tabs");
  return (
    <>
      <SectionTabs
        label={t("label")}
        tabs={[
          { href: "/progress", label: t("body"), exact: true },
          { href: "/progress/strength", label: t("strength") },
          { href: "/progress/muscles", label: t("muscles") },
          { href: "/progress/photos", label: t("photos") },
          { href: "/progress/reports", label: t("reports") },
        ]}
      />
      {children}
    </>
  );
}
