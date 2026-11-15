import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MOBILITY_EXERCISES_BY_ID, WARMUP_EXERCISES } from "@/data/mobility";
import { expandRoutine, stepsDurationSeconds } from "@/domain/mobility/routines";
import { buildWarmup } from "@/domain/mobility/warmup";
import { requireUser } from "@/features/auth/session";
import { toPlayerSteps } from "@/features/mobility/player-steps";
import type { WarmupPlan } from "@/features/training/components/workout/warmup-card";
import { WorkoutScreen } from "@/features/training/components/workout/workout-screen";
import { getTrainingSettings } from "@/features/training/services/settings-service";
import { getWorkoutView } from "@/features/training/services/workout-view";
import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/server/context";

/** Warm-up aus den Bewegungsmustern des Trainings; `null`, wenn nichts dazu passt. */
function toWarmupPlan(patterns: Parameters<typeof buildWarmup>[0]): WarmupPlan | null {
  const warmup = buildWarmup(patterns, WARMUP_EXERCISES);
  if (!warmup) return null;
  const steps = expandRoutine(
    { id: "warmup", name: "", description: "", regions: warmup.regions, complaints: [], level: "easy", items: warmup.items },
    MOBILITY_EXERCISES_BY_ID,
  );
  return {
    steps: toPlayerSteps(steps),
    minutes: Math.max(1, Math.round(stepsDurationSeconds(steps) / 60)),
    regions: warmup.regions.slice(0, 3),
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("workout");
  return { title: t("title") };
}

export default async function WorkoutPage({ params }: PageProps<"/workout/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const db = getDb();
  const [view, settings] = await Promise.all([
    getWorkoutView(db, user.id, id, user.unitSystem === "imperial" ? "lbs" : "kg").catch((error: unknown) => {
      if (error instanceof AppError && error.code === "NOT_FOUND") return null;
      throw error;
    }),
    getTrainingSettings(db, user.id),
  ]);
  if (!view) notFound();
  const warmup = view.status === "in_progress" ? toWarmupPlan(view.exercises.flatMap((exercise) => exercise.pattern ?? [])) : null;
  // Der Schlüssel sorgt dafür, dass nach dem Beenden der frische Stand geladen wird.
  return (
    <WorkoutScreen
      key={`${view.id}-${view.status}`}
      view={view}
      unitSystem={user.unitSystem}
      userId={user.id}
      checkIn={settings.exerciseCheckIn}
      warmup={warmup}
    />
  );
}
