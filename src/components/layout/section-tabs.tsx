"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface SectionTab {
  href: string;
  label: string;
  /** Nur bei exakt diesem Pfad aktiv (für die Startseite eines Bereichs). */
  exact?: boolean;
}

interface SectionTabsProps {
  tabs: SectionTab[];
  label: string;
  /** Viele Tabs: statt gleich breiter Spalten eine seitlich wischbare Leiste. */
  scrollable?: boolean;
}

/** Unternavigation eines Bereichs als gleich breite Tabs oder als wischbare Leiste. */
export function SectionTabs({ tabs, label, scrollable = false }: SectionTabsProps) {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Der aktive Tab soll in der wischbaren Leiste sichtbar sein.
  useEffect(() => {
    if (scrollable) activeRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [scrollable, pathname]);

  return (
    <nav
      aria-label={label}
      className={cn(
        "bg-secondary mb-6 gap-1 rounded-xl p-1",
        scrollable
          ? "flex [scrollbar-width:none] overflow-x-auto [&::-webkit-scrollbar]:hidden"
          : "grid auto-cols-fr grid-flow-col",
      )}
    >
      {tabs.map((tab) => {
        const active = tab.exact ? pathname === tab.href : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            ref={active ? activeRef : undefined}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center justify-center rounded-lg text-center text-sm font-medium transition-colors",
              scrollable ? "shrink-0 px-4" : "px-1",
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
