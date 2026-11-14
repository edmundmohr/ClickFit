import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/features/auth/session";
import { WorkoutScreen } from "@/features/training/components/workout/workout-screen";
import { getWorkoutView } from "@/features/training/services/workout-view";
import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workout");
  return { title: t("title") };
}

export default async function WorkoutPage({ params }: PageProps<"/workout/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const view = await getWorkoutView(getDb(), user.id, id, user.unitSystem === "imperial" ? "lbs" : "kg").catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!view) notFound();
  // Der Schlüssel sorgt dafür, dass nach dem Beenden der frische Stand geladen wird.
  return <WorkoutScreen key={`${view.id}-${view.status}`} view={view} unitSystem={user.unitSystem} />;
}
