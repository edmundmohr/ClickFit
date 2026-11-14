"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { DropletIcon, DumbbellIcon, ScaleIcon, UtensilsIcon, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { LocalDate } from "@/lib/dates";
import { addWaterAction } from "@/features/nutrition/actions";

const QUICK_WATER_ML = 250;
const tile =
  "hover:bg-accent/60 flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border text-xs font-medium disabled:opacity-50";

interface QuickActionsProps {
  today: LocalDate;
  trainingHref: string;
  mealHref: string;
}

/** Schnellzugriff auf die häufigsten Aktionen. */
export function QuickActions({ today, trainingHref, mealHref }: QuickActionsProps) {
  const t = useTranslations("progress.dashboard.quick");
  const { run, pending } = useActionRunner();
  const links: { href: string; label: string; icon: LucideIcon }[] = [
    { href: trainingHref, label: t("training"), icon: DumbbellIcon },
    { href: mealHref, label: t("meal"), icon: UtensilsIcon },
  ];

  return (
    <nav aria-label={t("label")} className="grid grid-cols-4 gap-2">
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={tile}>
          <link.icon className="size-5" aria-hidden />
          {link.label}
        </Link>
      ))}
      <button
        type="button"
        disabled={pending}
        className={tile}
        onClick={() => run(() => addWaterAction(today, QUICK_WATER_ML), () => toast.success(t("waterAdded")))}
      >
        <DropletIcon className="size-5 text-sky-500" aria-hidden />
        {t("water")}
      </button>
      <Link href="/progress#weight" className={tile}>
        <ScaleIcon className="size-5" aria-hidden />
        {t("weight")}
      </Link>
    </nav>
  );
}
