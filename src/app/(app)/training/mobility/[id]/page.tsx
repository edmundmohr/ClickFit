import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, ChevronDownIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MOBILITY_EXERCISES_BY_ID, MOBILITY_ROUTINES_BY_ID } from "@/data/mobility";
import { expandRoutine, stepsDurationSeconds } from "@/domain/mobility/routines";
import { requireUser } from "@/features/auth/session";
import { RoutinePlayer, type PlayerStep } from "@/features/mobility/components/routine-player";

export async function generateMetadata({ params }: PageProps<"/training/mobility/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: MOBILITY_ROUTINES_BY_ID.get(id)?.name };
}

export default async function MobilityRoutinePage({ params }: PageProps<"/training/mobility/[id]">) {
  await requireUser();
  const { id } = await params;
  const routine = MOBILITY_ROUTINES_BY_ID.get(id);
  if (!routine) notFound();

  const t = await getTranslations("mobility");
  const steps = expandRoutine(routine, MOBILITY_EXERCISES_BY_ID);
  const playerSteps: PlayerStep[] = steps.map((step, index) => ({
    key: `${index}-${step.exercise.id}-${step.side ?? "both"}`,
    name: step.exercise.name,
    side: step.side,
    durationSeconds: step.durationSeconds,
    reps: step.reps,
    instructions: step.exercise.instructions,
    hint: step.exercise.hint ?? null,
  }));
  // Für die Übersicht steht jede Übung einmal da; die zweite Seite steckt in „je Seite“.
  const exercises = steps.filter((step) => step.side !== "right");
  const meta = [
    t("routine.minutes", { minutes: Math.round(stepsDurationSeconds(steps) / 60) }),
    t("routine.steps", { count: steps.length }),
    t(`levels.${routine.level}`),
  ].join(" · ");

  return (
    <>
      <Link href="/training/mobility" className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("detail.back")}
      </Link>
      <PageHeader title={routine.name} description={meta} />
      <div className="grid grid-cols-1 gap-4">
        <div className="grid gap-3">
          <p>{routine.description}</p>
          <div className="flex flex-wrap gap-1.5">
            {routine.regions.map((region) => (
              <Badge key={region}>{t(`regions.${region}`)}</Badge>
            ))}
            {routine.complaints.map((complaint) => (
              <Badge key={complaint} variant="secondary">
                {t(`complaints.${complaint}`)}
              </Badge>
            ))}
          </div>
        </div>
        <RoutinePlayer routineId={routine.id} steps={playerSteps} />
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.stepsTitle")}</CardTitle>
            <CardDescription>{t("detail.stepsHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="divide-y">
              {exercises.map((step, index) => (
                <li key={`${index}-${step.exercise.id}`}>
                  <details className="group">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 py-2 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1 font-medium">{step.exercise.name}</span>
                      <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                        {step.durationSeconds !== null
                          ? t("detail.seconds", { count: step.durationSeconds })
                          : t("detail.reps", { count: step.reps ?? 0 })}
                        {step.side ? ` ${t("detail.perSide")}` : ""}
                      </span>
                      <ChevronDownIcon
                        className="text-muted-foreground size-4 shrink-0 transition-transform group-open:rotate-180"
                        aria-hidden
                      />
                    </summary>
                    <div className="grid gap-2 pb-3">
                      <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                        {step.exercise.instructions.map((instruction) => (
                          <li key={instruction}>{instruction}</li>
                        ))}
                      </ol>
                      {step.exercise.hint ? <p className="text-muted-foreground text-sm">{step.exercise.hint}</p> : null}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
