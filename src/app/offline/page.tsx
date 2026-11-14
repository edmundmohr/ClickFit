import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { WifiOffIcon } from "lucide-react";
import { ReloadButton } from "@/components/reload-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("offline");
  return { title: t("title") };
}

/** Wird vom Service Worker gecacht und gezeigt, wenn eine Navigation ohne Netz scheitert. */
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <WifiOffIcon className="text-muted-foreground size-10" aria-hidden />
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground max-w-sm text-sm">{t("description")}</p>
      <ReloadButton label={t("retry")} />
    </main>
  );
}
