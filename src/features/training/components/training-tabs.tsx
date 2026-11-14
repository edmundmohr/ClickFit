"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/training", key: "plan" },
  { href: "/training/exercises", key: "exercises" },
  { href: "/training/history", key: "history" },
  { href: "/training/calendar", key: "calendar" },
] as const;

/** Unternavigation im Bereich Training. */
export function TrainingTabs() {
  const pathname = usePathname();
  const t = useTranslations("training.tabs");
  return (
    <nav aria-label={t("label")} className="bg-secondary mb-6 grid grid-cols-4 gap-1 rounded-xl p-1">
      {TABS.map((tab) => {
        const active = tab.href === "/training" ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-lg text-sm font-medium transition-colors",
              active ? "bg-background shadow-xs" : "text-muted-foreground",
            )}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </nav>
  );
}
