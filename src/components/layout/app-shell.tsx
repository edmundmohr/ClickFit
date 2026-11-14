import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DumbbellIcon } from "lucide-react";
import { MainNav } from "./main-nav";

export async function AppShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("common");
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/95 sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-14 items-center px-4">
          <Link href="/" className="flex items-center gap-2 text-base font-semibold">
            <DumbbellIcon className="text-primary size-5" aria-hidden />
            {t("appName")}
          </Link>
        </div>
      </header>
      <div className="flex flex-1 flex-col md:flex-row">
        <MainNav />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-24 md:pb-10">{children}</main>
      </div>
    </div>
  );
}
