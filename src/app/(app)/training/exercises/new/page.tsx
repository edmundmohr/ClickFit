import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { CustomExerciseForm } from "@/features/training/components/custom-exercise-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("training.customExercise");
  return { title: t("newTitle") };
}

export default async function NewExercisePage() {
  await requireUser();
  const t = await getTranslations("training");
  return (
    <>
      <Link href="/training/exercises" className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("library.back")}
      </Link>
      <PageHeader title={t("customExercise.newTitle")} />
      <CustomExerciseForm exerciseId={null} initial={null} />
    </>
  );
}
