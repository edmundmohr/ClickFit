"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
  /** Nur bei exakt diesem Pfad aktiv (für die Startseite eines Bereichs). */
  exact?: boolean;
}

/** Unternavigation eines Bereichs als gleich breite Tabs. */
export function SectionTabs({ tabs, label }: { tabs: SectionTab[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label={label}
      className="bg-secondary mb-6 grid auto-cols-fr grid-flow-col gap-1 rounded-xl p-1"
    >
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-lg px-1 text-center text-sm font-medium transition-colors",
              active ? "bg-background shadow-xs" : "text-muted-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
