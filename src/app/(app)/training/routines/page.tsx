import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PencilIcon, PlayIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { startWorkoutAction } from "@/features/training/actions";
import { FolderActions, NewFolderButton } from "@/features/training/components/routines/folder-actions";
import { listFolders } from "@/features/training/services/plan-service";
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
  const [folders, running] = await Promise.all([listFolders(db, user.id), getInProgressSession(db, user.id)]);

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
                <div className="flex min-w-0 items-center gap-2">
                  <h2 className="truncate text-lg font-semibold">{title}</h2>
                  {folder.status === "active" ? <Badge>{t("routines.weekPlan")}</Badge> : null}
                </div>
                <FolderActions
                  folderId={folder.id}
                  title={title}
                  name={folder.name ?? ""}
                  isActive={folder.status === "active"}
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
                          <form action={startWorkoutAction}>
                            <input type="hidden" name="planDayId" value={day.id} />
                            <Button
                              type="submit"
                              variant="outline"
                              size="icon"
                              className="size-11"
                              aria-label={t("routines.startLabel", { name })}
                            >
                              <PlayIcon aria-hidden />
                            </Button>
                          </form>
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
      </div>
    </>
  );
}
