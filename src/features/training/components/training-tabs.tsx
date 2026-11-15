import { getTranslations } from "next-intl/server";
import { SectionTabs } from "@/components/layout/section-tabs";

/** Unternavigation im Bereich Training. */
export async function TrainingTabs() {
  const t = await getTranslations("training.tabs");
  return (
    <SectionTabs
      scrollable
      label={t("label")}
      tabs={[
        // Die Pläne erreicht man über „Pläne verwalten“ auf der Plan-Seite; dort bleibt „Plan“ markiert.
        { href: "/training", label: t("plan"), exact: true, matches: ["/training/plans", "/training/routines"] },
        { href: "/training/cardio", label: t("cardio") },
        { href: "/training/mobility", label: t("mobility") },
        { href: "/training/exercises", label: t("exercises") },
        { href: "/training/history", label: t("history") },
        { href: "/training/calendar", label: t("calendar") },
      ]}
    />
  );
}
