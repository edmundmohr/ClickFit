import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon, DownloadIcon, MapPinIcon, SettingsIcon, SlidersHorizontalIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { SignOutButton } from "@/features/users/components/sign-out-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("more");
  return { title: t("title") };
}

function MoreLink({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="hover:bg-accent flex min-h-14 items-center gap-3 rounded-lg border px-4 text-sm font-medium transition-colors"
    >
      <Icon className="text-muted-foreground size-5" aria-hidden />
      <span className="flex-1">{label}</span>
      <ChevronRightIcon className="text-muted-foreground size-4" aria-hidden />
    </Link>
  );
}

export default async function MorePage() {
  const user = await requireUser();
  const t = await getTranslations();
  return (
    <>
      <PageHeader title={t("more.title")} description={user.username} />
      <div className="grid gap-3">
        <MoreLink href="/training/gyms" icon={MapPinIcon} label={t("gyms.title")} />
        <MoreLink href="/training/adjustments" icon={SlidersHorizontalIcon} label={t("adjustments.title")} />
        <MoreLink href="/export" icon={DownloadIcon} label={t("more.export")} />
        <MoreLink href="/settings" icon={SettingsIcon} label={t("nav.settings")} />
        {user.role === "admin" ? (
          <MoreLink href="/admin" icon={UsersIcon} label={t("nav.admin")} />
        ) : null}
        <SignOutButton />
      </div>
    </>
  );
}
