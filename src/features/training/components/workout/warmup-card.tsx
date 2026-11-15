"use client";

import { useTranslations } from "next-intl";
import type { MobilityRegion } from "@/domain/mobility/types";
import { RoutinePlayer } from "@/features/mobility/components/routine-player";
import type { PlayerStep } from "@/features/mobility/player-steps";

export interface WarmupPlan {
  steps: PlayerStep[];
  minutes: number;
  /** Die wichtigsten Körperbereiche des Trainings, für den Hinweistext. */
  regions: MobilityRegion[];
}

/** Optionales Mobility-Warm-up am Anfang des Trainings: starten oder überspringen. */
export function WarmupCard({ plan, onClose }: { plan: WarmupPlan; onClose: () => void }) {
  const t = useTranslations();
  const regions = plan.regions.map((region) => t(`mobility.regions.${region}`)).join(", ");
  return (
    <section aria-label={t("workout.mobilityWarmup.title")}>
      <RoutinePlayer
        steps={plan.steps}
        onDone={onClose}
        offer={{
          title: t("workout.mobilityWarmup.title"),
          description: t("workout.mobilityWarmup.text", { minutes: plan.minutes, regions }),
          startLabel: t("workout.mobilityWarmup.start"),
          skipLabel: t("workout.mobilityWarmup.skip"),
          onSkip: onClose,
        }}
      />
    </section>
  );
}
