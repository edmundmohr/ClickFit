import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronDownIcon, MapPinIcon, PencilIcon, PlayIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { ArchivedPlanActions, FolderActions, NewFolderButton } from "@/features/training/components/routines/folder-actions";
import { listGyms } from "@/features/training/services/gym-service";
import { StartWorkoutForm } from "@/features/training/components/start-workout-form";
import { listFolders, type PlanStatus } from "@/features/training/services/plan-service";
import { getInProgressSession } from "@/features/training/services/workout-service";
import { folderTitle, routineTitle } from "@/features/training/titles";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("routines");
  return { title: t("title") };
}

export default async function RoutinesPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const db = getDb();
  const [folders, archived, running, gyms] = await Promise.all([
    listFolders(db, user.id),
    listFolders(db, user.id, { archived: true }),
    getInProgressSession(db, user.id),
    listGyms(db, user.id),
  ]);
  const locations = gyms.map((gym) => ({ id: gym.id, name: gym.name ?? t(`training.locations.${gym.type}`) }));
  const locationName = (gymId: string | null) => locations.find((location) => location.id === gymId)?.name ?? null;

  return (
    <>
      <PageHeader title={t("routines.title")} description={t("routines.description")} />
      <div className="grid gap-6">
        {folders.length === 0 ? <p className="text-muted-foreground text-sm">{t("routines.noFolders")}</p> : null}
        {folders.map((folder) => {
          const title = folderTitle(folder, (split) => t(`training.splits.${split}`));
          return (
            <section key={folder.id} className="grid gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="grid min-w-0 gap-1">
                  <h2 className="truncate text-lg font-semibold">{title}</h2>
                  <PlanBadges status={folder.status} location={locationName(folder.gymProfileId)} />
                </div>
                <FolderActions
                  folderId={folder.id}
                  title={title}
                  name={folder.name ?? ""}
                  status={folder.status}
                  gymId={folder.gymProfileId}
                  locations={locations}
                />
              </div>
              {folder.days.length === 0 ? (
                <p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
                  {t("routines.emptyFolder")}
                </p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {folder.days.map((day) => {
                    const name = routineTitle(day, (focus) => t(`training.focus.${focus}`));
                    return (
                      <li key={day.id} className="flex items-center gap-1 py-1 pr-1 pl-4">
                        <Link href={`/training/routines/${day.id}`} className="min-w-0 flex-1 py-2">
                          <span className="block truncate font-medium">{name}</span>
                          <span className="text-muted-foreground block truncate text-sm">
                            {day.weekday === null ? t("training.plan.noDay") : t(`training.weekdays.${day.weekday}`)}
                            {" · "}
                            {t("routines.summary", { count: day.exercises.length, minutes: day.estimatedMinutes })}
                          </span>
                        </Link>
                        <Button asChild variant="ghost" size="icon" className="size-11">
                          <Link href={`/training/routines/${day.id}`} aria-label={t("routines.editLabel", { name })}>
                            <PencilIcon aria-hidden />
                          </Link>
                        </Button>
                        {!running && day.exercises.length > 0 ? (
                          <StartWorkoutForm planDayId={day.id}>
                            <Button
                              type="submit"
                              variant="outline"
                              size="icon"
                              className="size-11"
                              aria-label={t("routines.startLabel", { name })}
                            >
                              <PlayIcon aria-hidden />
                            </Button>
                          </StartWorkoutForm>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
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
              {archived.map((folder) => {
                const title = folderTitle(folder, (split) => t(`training.splits.${split}`));
                return (
                  <li key={folder.id} className="flex items-center gap-2 py-1 pr-1 pl-4">
                    <span className="min-w-0 flex-1 py-2">
                      <span className="block truncate font-medium">{title}</span>
                      <span className="text-muted-foreground block truncate text-sm">
                        {t("routines.archivedSummary", { count: folder.days.length })}
                      </span>
                    </span>
                    <ArchivedPlanActions folderId={folder.id} title={title} />
                  </li>
                );
              })}
            </ul>
          </details>
        ) : null}
      </div>
    </>
  );
}

/** Rolle des Plans und – falls festgelegt – sein fester Ort. */
async function PlanBadges({ status, location }: { status: PlanStatus; location: string | null }) {
  const t = await getTranslations("routines");
  if (status !== "active" && status !== "extra" && location === null) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {status === "active" ? <Badge>{t("mainPlan")}</Badge> : null}
      {status === "extra" ? <Badge variant="secondary">{t("extraPlan")}</Badge> : null}
      {location ? (
        <Badge variant="outline" className="max-w-full">
          <MapPinIcon aria-hidden />
          <span className="truncate">{t("locationBadge", { name: location })}</span>
        </Badge>
      ) : null}
    </div>
  );
}
