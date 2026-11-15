import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, ChevronRightIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { AddRoutineButton, PlanManageActions } from "@/features/training/components/routines/folder-actions";
import { PlanLocationCard } from "@/features/training/components/routines/plan-location-dialog";
import { PlanRolePicker } from "@/features/training/components/routines/plan-role-picker";
import { StartWorkoutForm } from "@/features/training/components/start-workout-form";
import { listGyms } from "@/features/training/services/gym-service";
import { listFolders } from "@/features/training/services/plan-service";
import { getInProgressSession } from "@/features/training/services/workout-service";
import { folderTitle, routineTitle } from "@/features/training/titles";
import type { Split } from "@/domain/training/types";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("routines");
  return { title: t("title") };
}

/** Ein Plan auf einen Blick: Routinen, Einplanung, Ort und Verwaltung, von oben nach unten. */
export default async function PlanPage({ params }: PageProps<"/training/plans/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTranslations();
  const db = getDb();
  const [folders, running, gyms] = await Promise.all([
    listFolders(db, user.id),
    getInProgressSession(db, user.id),
    listGyms(db, user.id),
  ]);
  const folder = folders.find((item) => item.id === id);
  // Archivierte (und gelöschte) Pläne verwaltet die Übersicht: wiederherstellen oder löschen.
  if (!folder || folder.status === "archived") redirect("/training/plans");

  const splitLabel = (split: Split | "custom") => t(`training.splits.${split}`);
  const title = folderTitle(folder, splitLabel);
  const main = folders.find((item) => item.status === "active" && item.id !== folder.id);
  const locations = gyms.map((gym) => ({ id: gym.id, name: gym.name ?? t(`training.locations.${gym.type}`) }));

  return (
    <>
      <Link href="/training/plans" className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("routines.back")}
      </Link>
      <PageHeader title={title} description={t(`routines.roles.${folder.status}.label`)} />
      <div className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle>{t("routines.routinesTitle")}</CardTitle>
            <CardDescription>{t("routines.routinesHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
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
                      <Link href={`/training/routines/${day.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{name}</span>
                          <span className="text-muted-foreground block truncate text-sm">
                            {day.weekday === null ? t("training.plan.noDay") : t(`training.weekdays.${day.weekday}`)}
                            {" · "}
                            {t("routines.summary", { count: day.exercises.length, minutes: day.estimatedMinutes })}
                          </span>
                        </span>
                        <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
                      </Link>
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
            <AddRoutineButton folderId={folder.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("routines.roleTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanRolePicker
              folderId={folder.id}
              title={title}
              status={folder.status}
              currentMain={main ? folderTitle(main, splitLabel) : null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("routines.locationCardTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanLocationCard folderId={folder.id} title={title} gymId={folder.gymProfileId} locations={locations} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("routines.manageTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PlanManageActions
              folderId={folder.id}
              title={title}
              name={folder.name ?? ""}
              isMain={folder.status === "active"}
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
