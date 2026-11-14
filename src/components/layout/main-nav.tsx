"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { NAV_ITEMS, isNavItemActive } from "./nav-items";

/** Untere Tab-Leiste am Handy, ab dem Breakpoint `md` eine seitliche Navigation. */
export function MainNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  return (
    <nav
      aria-label={t("mainNavigation")}
      className="bg-background/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur md:static md:w-56 md:shrink-0 md:border-t-0 md:border-r md:pb-0"
    >
      <ul className="mx-auto flex max-w-lg justify-between px-2 md:mx-0 md:max-w-none md:flex-col md:gap-1 md:p-3">
        {NAV_ITEMS.map((item) => {
          const active = isNavItemActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1 md:flex-none">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-1 rounded-md px-1 text-xs font-medium transition-colors md:min-h-11 md:flex-row md:justify-start md:gap-3 md:px-3 md:text-sm",
                  active
                    ? "text-primary md:bg-accent"
                    : "text-muted-foreground hover:text-foreground md:hover:bg-accent/60",
                )}
              >
                <Icon className="size-5" aria-hidden />
                <span>{t(item.labelKey)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
