import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { getCatalog } from "@/features/training/catalog";
import { ExerciseLibrary } from "@/features/training/components/exercise-library";
import { getProfile } from "@/features/training/services/profile-service";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("training.library");
  return { title: t("title") };
}

export default async function ExercisesPage() {
  const user = await requireUser();
  const t = await getTranslations("training.library");
  const stored = await getProfile(getDb(), user.id);
  const exercises = getCatalog()
    .map(({ id, name, primary, equipment }) => ({ id, name, primary, equipment }))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return (
    <>
      <PageHeader title={t("title")} />
      <ExerciseLibrary exercises={exercises} ownEquipment={stored?.equipment ?? null} />
    </>
  );
}
