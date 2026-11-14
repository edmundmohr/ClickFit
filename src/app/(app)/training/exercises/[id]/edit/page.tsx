import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { CustomExerciseForm } from "@/features/training/components/custom-exercise-form";
import { getCustomExercise } from "@/features/training/services/exercise-service";
import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("training.customExercise");
  return { title: t("editTitle") };
}

export default async function EditExercisePage({ params }: PageProps<"/training/exercises/[id]/edit">) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTranslations("training");
  const exercise = await getCustomExercise(getDb(), user.id, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return notFound();
    throw error;
  });

  return (
    <>
      <Link href={`/training/exercises/${id}`} className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {exercise.name}
      </Link>
      <PageHeader title={t("customExercise.editTitle")} />
      <CustomExerciseForm
        exerciseId={id}
        initial={{
          name: exercise.name,
          type: exercise.type,
          mechanic: exercise.mechanic,
          pattern: exercise.pattern,
          primary: exercise.primary,
          secondary: exercise.secondary,
          equipment: exercise.equipment,
          note: exercise.instructions.join("\n"),
        }}
      />
    </>
  );
}
