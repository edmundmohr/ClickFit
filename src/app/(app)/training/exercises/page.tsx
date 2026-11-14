import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getTrainingContext } from "@/features/training/services/context-service";
import { toLocalDate } from "@/lib/dates";
import { ExerciseLibrary } from "@/features/training/components/exercise-library";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("training.library");
  return { title: t("title") };
}

export default async function ExercisesPage() {
  const user = await requireUser();
  const t = await getTranslations("training.library");
  const context = await getTrainingContext(getDb(), user.id, toLocalDate(new Date()));
  const excluded = new Set(context.profile?.excludedExerciseIds ?? []);
  const exercises = context.catalog.all
    .map(({ id, name, primary, equipment, custom }) => ({
      id,
      name,
      primary,
      equipment,
      custom: custom ?? false,
      excluded: excluded.has(id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <>
      <PageHeader title={t("title")} />
      <Button asChild variant="outline" className="mb-4">
        <Link href="/training/exercises/new">
          <PlusIcon aria-hidden />
          {t("newCustom")}
        </Link>
      </Button>
      <ExerciseLibrary exercises={exercises} ownEquipment={context.profile?.equipment ?? null} />
    </>
  );
}
