import { getTranslations } from "next-intl/server";
import { SectionTabs } from "@/components/layout/section-tabs";

export default async function NutritionLayout({ children }: LayoutProps<"/nutrition">) {
  const t = await getTranslations("nutrition.tabs");
  return (
    <>
      <SectionTabs
        label={t("label")}
        tabs={[
          { href: "/nutrition", label: t("diary"), exact: true },
          { href: "/nutrition/recipes", label: t("recipes") },
          { href: "/nutrition/plan", label: t("plan") },
          { href: "/nutrition/targets", label: t("targets") },
        ]}
      />
      {children}
    </>
  );
}
