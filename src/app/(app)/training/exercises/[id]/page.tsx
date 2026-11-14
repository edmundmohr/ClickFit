import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { findExercise, getCatalog } from "@/features/training/catalog";
import { ExerciseNoteForm } from "@/features/training/components/exercise-note-form";
import { getProfile } from "@/features/training/services/profile-service";
import { getExerciseNotes } from "@/features/training/services/workout-service";
import { findAlternatives } from "@/domain/training/plan-generator";
import { getDb } from "@/lib/server/context";

export async function generateMetadata({ params }: PageProps<"/training/exercises/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: findExercise(id)?.name };
}

export default async function ExerciseDetailPage({ params }: PageProps<"/training/exercises/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const exercise = findExercise(id);
  if (!exercise) notFound();

  const t = await getTranslations();
  const db = getDb();
  const [stored, notes] = await Promise.all([getProfile(db, user.id), getExerciseNotes(db, user.id, [id])]);
  const alternatives = findAlternatives(exercise, getCatalog(), { equipment: stored?.equipment, limit: 6 });

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
            <ol className="list-decimal space-y-2 pl-5">
              {exercise.instructions.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
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
