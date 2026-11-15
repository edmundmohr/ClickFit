import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import type { EditorItem, PickerExercise } from "@/features/training/components/routines/editor-state";
import { RoutineEditor } from "@/features/training/components/routines/routine-editor";
import { getUserCatalog } from "@/features/training/services/exercise-service";
import { getRoutine, listFolders } from "@/features/training/services/plan-service";
import { folderTitle, routineTitle } from "@/features/training/titles";
import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("routines.editor");
  return { title: t("title") };
}

export default async function RoutinePage({ params }: PageProps<"/training/routines/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTranslations();
  const db = getDb();
  const routine = await getRoutine(db, user.id, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return notFound();
    throw error;
  });
  const [folders, catalog] = await Promise.all([listFolders(db, user.id), getUserCatalog(db, user.id)]);

  const items: EditorItem[] = routine.day.exercises.map((entry) => ({
    key: entry.id,
    exerciseId: entry.exercise.id,
    name: entry.exercise.name,
    type: entry.exercise.type,
    sets: entry.sets,
    repMin: entry.repMin,
    repMax: entry.repMax,
    targetRir: entry.targetRir,
    restSeconds: entry.restSeconds,
    groupId: entry.groupId,
    archived: entry.exercise.archived ?? false,
  }));
  const exercises: PickerExercise[] = catalog.all
    .filter((exercise) => exercise.pattern !== "cardio")
    .map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      type: exercise.type,
      muscles: exercise.primary.map((muscle) => t(`muscles.${muscle}`)).join(", "),
      custom: exercise.custom ?? false,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <>
      <Link
        href={`/training/plans/${routine.folder.id}`}
        className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("routines.backToPlan", { name: folderTitle(routine.folder, (split) => t(`training.splits.${split}`)) })}
      </Link>
      <PageHeader title={t("routines.editor.title")} />
      <RoutineEditor
        routineId={routine.day.id}
        initialName={routine.day.name ?? ""}
        fallbackName={routineTitle(routine.day, (focus) => t(`training.focus.${focus}`))}
        initialWeekday={routine.day.weekday ?? 0}
        initialFolderId={routine.folder.id}
        initialItems={items}
        folders={folders.map((folder) => ({
          id: folder.id,
          title: folderTitle(folder, (split) => t(`training.splits.${split}`)),
        }))}
        exercises={exercises}
      />
    </>
  );
}
