import type { MobilitySide, MobilityStep } from "@/domain/mobility/types";

/** Ein Schritt des geführten Ablaufs, fertig aufbereitet für die Anzeige. */
export interface PlayerStep {
  key: string;
  name: string;
  side: MobilitySide | null;
  /** Haltezeit; `null` bei Wiederholungen. */
  durationSeconds: number | null;
  /** Wiederholungen; `null` bei gehaltenen Übungen. */
  reps: number | null;
  instructions: string[];
  hint: string | null;
}

export function toPlayerSteps(steps: readonly MobilityStep[]): PlayerStep[] {
  return steps.map((step, index) => ({
    key: `${index}-${step.exercise.id}-${step.side ?? "both"}`,
    name: step.exercise.name,
    side: step.side,
    durationSeconds: step.durationSeconds,
    reps: step.reps,
    instructions: step.exercise.instructions,
    hint: step.exercise.hint ?? null,
  }));
}
