import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { findExercise } from "@/features/training/catalog";
import { ExerciseActions } from "@/features/training/components/exercise-actions";
import { ExerciseNoteForm } from "@/features/training/components/exercise-note-form";
import { getTrainingContext } from "@/features/training/services/context-service";
import { getUserCatalog, isCustomExerciseId } from "@/features/training/services/exercise-service";
import { getExerciseNotes } from "@/features/training/services/workout-service";
import { findAlternatives } from "@/domain/training/plan-generator";
import { toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

export async function generateMetadata({ params }: PageProps<"/training/exercises/[id]">): Promise<Metadata> {
  const { id } = await params;
  const builtIn = findExercise(id);
  if (builtIn || !isCustomExerciseId(id)) return { title: builtIn?.name };
  // Eigene Übungen stehen nicht im eingebauten Katalog: Der Name kommt aus dem Konto des Nutzers.
  const user = await requireUser();
  return { title: (await getUserCatalog(getDb(), user.id)).find(id)?.name };
}

export default async function ExerciseDetailPage({ params }: PageProps<"/training/exercises/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTranslations();
  const db = getDb();
  const [context, notes] = await Promise.all([
    getTrainingContext(db, user.id, toLocalDate(new Date())),
    getExerciseNotes(db, user.id, [id]),
  ]);
  const exercise = context.catalog.find(id);
  if (!exercise || exercise.archived) notFound();
  const excluded = context.profile?.excludedExerciseIds.includes(id) ?? false;
  const alternatives = findAlternatives(exercise, context.catalog.all, {
    equipment: context.profile?.equipment,
    excludedIds: context.profile?.excludedExerciseIds,
    limit: 6,
  });

  return (
    <>
      <Link href="/training/exercises" className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("training.library.back")}
      </Link>
      <PageHeader
        title={exercise.name}
        description={`${t(`training.exerciseTypes.${exercise.type}`)} · ${t(`training.mechanics.${exercise.mechanic}`)}`}
      />
      <div className="grid gap-4">
        {excluded ? (
          <p className="rounded-md border border-amber-500/50 px-3 py-2 text-sm">{t("training.library.excludedHint")}</p>
        ) : null}
        <ExerciseActions
          exerciseId={exercise.id}
          excluded={excluded}
          canExclude={context.profile !== null}
          custom={exercise.custom ?? false}
        />
        <Card>
          <CardContent className="grid gap-4">
            <div>
              <h2 className="mb-2 text-sm font-medium">{t("training.library.primary")}</h2>
              <div className="flex flex-wrap gap-2">
                {exercise.primary.map((muscle) => (
                  <Badge key={muscle}>{t(`muscles.${muscle}`)}</Badge>
                ))}
              </div>
            </div>
            {exercise.secondary.length > 0 ? (
              <div>
                <h2 className="mb-2 text-sm font-medium">{t("training.library.secondary")}</h2>
                <div className="flex flex-wrap gap-2">
                  {exercise.secondary.map((muscle) => (
                    <Badge key={muscle} variant="secondary">
                      {t(`muscles.${muscle}`)}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}
            <div>
              <h2 className="mb-2 text-sm font-medium">{t("training.library.equipment")}</h2>
              <div className="flex flex-wrap gap-2">
                {exercise.equipment.length > 0 ? (
                  exercise.equipment.map((item) => (
                    <Badge key={item} variant="outline">
                      {t(`equipment.${item}`)}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="outline">{t("equipment.none")}</Badge>
                )}
              </div>
            </div>
            <p className="text-muted-foreground text-sm">
              {t("training.library.difficulty")}
              {": "}
              {t(`training.difficulty.${exercise.difficulty}`)}
              {exercise.unilateral ? ` · ${t("training.library.unilateral")}` : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("training.library.instructions")}</CardTitle>
          </CardHeader>
          <CardContent>
            {exercise.instructions.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("training.library.noInstructions")}</p>
            ) : (
              <ol className="list-decimal space-y-2 pl-5">
                {exercise.instructions.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("training.library.noteTitle")}</CardTitle>
            <CardDescription>{t("training.library.noteText")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ExerciseNoteForm exerciseId={exercise.id} initialNote={notes.get(exercise.id) ?? ""} />
          </CardContent>
        </Card>
        {alternatives.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("training.library.alternatives")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {alternatives.map((alternative) => (
                  <li key={alternative.id}>
                    <Link href={`/training/exercises/${alternative.id}`} className="flex min-h-11 items-center py-2 font-medium">
                      {alternative.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
