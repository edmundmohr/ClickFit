import {
  AppleIcon,
  DumbbellIcon,
  HouseIcon,
  LineChartIcon,
  MenuIcon,
  type LucideIcon,
} from "lucide-react";

export type NavLabelKey = "today" | "training" | "nutrition" | "progress" | "more";

export interface NavItem {
  href: string;
  labelKey: NavLabelKey;
  icon: LucideIcon;
  /** Weitere Pfad-Präfixe, bei denen dieser Eintrag als aktiv gilt. */
  matches?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/", labelKey: "today", icon: HouseIcon },
  { href: "/training", labelKey: "training", icon: DumbbellIcon },
  { href: "/nutrition", labelKey: "nutrition", icon: AppleIcon },
  { href: "/progress", labelKey: "progress", icon: LineChartIcon },
  { href: "/more", labelKey: "more", icon: MenuIcon, matches: ["/settings", "/admin"] },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  const prefixes = [item.href, ...(item.matches ?? [])];
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
