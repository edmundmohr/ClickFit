import { getTranslations } from "next-intl/server";
import { DumbbellIcon } from "lucide-react";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations("common");
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-2 text-xl font-semibold">
        <DumbbellIcon className="text-primary size-6" aria-hidden />
        {t("appName")}
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
