import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronDownIcon, ChevronRightIcon, MapPinIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { ArchivedPlanActions, NewFolderButton } from "@/features/training/components/routines/folder-actions";
import { listGyms } from "@/features/training/services/gym-service";
import { listFolders, type PlanView } from "@/features/training/services/plan-service";
import { folderTitle, plannedWeekdays } from "@/features/training/titles";
import { isScheduled } from "@/domain/training/plan-roles";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("routines");
  return { title: t("title") };
}

/**
 * Übersicht aller Pläne, getrennt nach „In deiner Woche“ (Haupt- und Zusatzpläne) und „Nicht
 * eingeplant“. Bearbeitet wird ein Plan auf seiner eigenen Seite; das Archiv liegt eingeklappt darunter.
 */
export default async function PlansPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const db = getDb();
  const [folders, archived, gyms] = await Promise.all([
    listFolders(db, user.id),
    listFolders(db, user.id, { archived: true }),
    listGyms(db, user.id),
  ]);
  const locationName = (gymId: string | null) => {
    const gym = gyms.find((item) => item.id === gymId);
    return gym ? (gym.name ?? t(`training.locations.${gym.type}`)) : null;
  };
  const title = (folder: PlanView) => folderTitle(folder, (split) => t(`training.splits.${split}`));
  const scheduled = folders.filter((folder) => isScheduled(folder.status));
  const unscheduled = folders.filter((folder) => !isScheduled(folder.status));

  const section = (key: "scheduled" | "unscheduled", plans: PlanView[]) =>
    plans.length === 0 ? null : (
      <section className="grid gap-2" aria-labelledby={`plans-${key}`}>
        <div className="grid gap-1">
          <h2 id={`plans-${key}`} className="text-lg font-semibold">
            {t(`routines.${key}Title`)}
          </h2>
          <p className="text-muted-foreground text-sm">{t(`routines.${key}Hint`)}</p>
        </div>
        <ul className="grid gap-2">
          {plans.map((folder) => {
            const name = title(folder);
            const location = locationName(folder.gymProfileId);
            const weekdays = plannedWeekdays(folder.days);
            return (
              <li key={folder.id}>
                <Link
                  href={`/training/plans/${folder.id}`}
                  className="hover:bg-accent flex items-center gap-3 rounded-xl border p-4 transition-colors"
                >
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{name}</span>
                      {folder.status === "active" ? <Badge>{t("routines.mainPlan")}</Badge> : null}
                      {folder.status === "extra" ? <Badge variant="secondary">{t("routines.extraPlan")}</Badge> : null}
                    </span>
                    <span className="text-muted-foreground text-sm">
                      {t("routines.routineCount", { count: folder.days.length })}
                      {folder.days.length > 0
                        ? ` · ${
                            weekdays.length > 0
                              ? weekdays.map((day) => t(`training.weekdaysShort.${day}`)).join(", ")
                              : t("routines.noFixedDays")
                          }`
                        : null}
                    </span>
                    {location ? (
                      <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                        <MapPinIcon className="size-4 shrink-0" aria-hidden />
                        <span className="truncate">{t("routines.locationBadge", { name: location })}</span>
                      </span>
                    ) : null}
                  </span>
                  <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    );

  const scheduledSection = section("scheduled", scheduled);
  const unscheduledSection = section("unscheduled", unscheduled);

  return (
    <>
      <PageHeader title={t("routines.title")} description={t("routines.description")} />
      <div className="grid gap-6">
        {folders.length === 0 ? <p className="text-muted-foreground text-sm">{t("routines.noFolders")}</p> : null}
        {scheduledSection}
        {unscheduledSection}
        <NewFolderButton />
        {archived.length > 0 ? (
          <details className="group rounded-xl border">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 font-medium [&::-webkit-details-marker]:hidden">
              <span>
                {t("routines.archiveTitle")}
                <span className="text-muted-foreground block text-sm font-normal">
                  {t("routines.archiveHint", { count: archived.length })}
                </span>
              </span>
              <ChevronDownIcon className="size-5 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <ul className="divide-y border-t">
              {archived.map((folder) => (
                <li key={folder.id} className="flex items-center gap-2 py-1 pr-1 pl-4">
                  <span className="min-w-0 flex-1 py-2">
                    <span className="block truncate font-medium">{title(folder)}</span>
                    <span className="text-muted-foreground block truncate text-sm">
                      {t("routines.archivedSummary", { count: folder.days.length })}
                    </span>
                  </span>
                  <ArchivedPlanActions folderId={folder.id} title={title(folder)} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </div>
    </>
  );
}
