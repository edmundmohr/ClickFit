"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlertIcon } from "lucide-react";
import { MUSCLES, type Muscle } from "@/domain/exercises/types";
import {
  MAX_FOCUS_MUSCLES,
  SELF_ASSESSMENTS,
  TRAINING_AGE_STEPS,
  isGoalAdvisable,
  suggestAssessment,
  toggleFocusMuscle,
} from "@/domain/training/onboarding";
import { GOALS, type Goal } from "@/domain/training/types";
import { MuscleMap } from "@/features/progress/components/muscle-map";
import { cn } from "@/lib/utils";
import { Gauge, OptionCard, RangeSlider, SwitchRow } from "./controls";
import { estimatedBodyFat } from "./state";
import type { BodyStepProps, StepProps } from "./steps-profile";

const MONTHS_PER_YEAR = 12;
/** Nicht gewählte Muskeln: in hellem wie dunklem Design gut vom Körperumriss zu unterscheiden. */
const IDLE_FILL = "color-mix(in oklab, var(--foreground) 16%, transparent)";

export function TrainingAgeStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding.trainingAge");
  const lastIndex = TRAINING_AGE_STEPS.length - 1;
  const index = Math.max(
    0,
    TRAINING_AGE_STEPS.findIndex((months) => months >= state.trainingMonths),
  );

  function describe(months: number): string {
    if (months === 0) return t("none");
    if (months === TRAINING_AGE_STEPS[lastIndex]) return t("yearsOpen", { count: months / MONTHS_PER_YEAR });
    if (months % MONTHS_PER_YEAR === 0) return t("years", { count: months / MONTHS_PER_YEAR });
    return t("months", { count: months });
  }

  // Die Selbsteinschätzung folgt der Erfahrung, bis sie im nächsten Schritt von Hand geändert wird.
  function change(trainingMonths: number, trainedRecently: boolean) {
    update({
      trainingMonths,
      trainedRecently,
      selfAssessment: suggestAssessment(trainingMonths, trainedRecently),
    });
  }

  const label = describe(TRAINING_AGE_STEPS[index]);
  return (
    <div className="mt-auto grid gap-8">
      <SwitchRow
        label={t("recent")}
        checked={state.trainedRecently}
        onChange={(checked) => change(state.trainingMonths, checked)}
      />
      <div className="grid gap-2">
        <p className="text-2xl font-bold" aria-live="polite">
          {label}
        </p>
        <RangeSlider
          id="training-age"
          label={t("label")}
          min={0}
          max={lastIndex}
          value={index}
          onChange={(next) => change(TRAINING_AGE_STEPS[next], state.trainedRecently)}
          valueText={label}
        />
      </div>
    </div>
  );
}

export function AssessmentStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding.assessment");
  return (
    <div role="radiogroup" aria-label={t("title")} className="grid gap-2.5">
      {SELF_ASSESSMENTS.map((level, index) => (
        <OptionCard
          key={level}
          selected={state.selfAssessment === level}
          onSelect={() => update({ selfAssessment: level })}
          title={t(`levels.${level}`)}
          hint={t(`hints.${level}`)}
          icon={<Gauge level={index} steps={SELF_ASSESSMENTS.length} />}
        />
      ))}
    </div>
  );
}

/** Richtung der beiden Kurven je Ziel: positive Werte steigen, negative fallen. */
const GOAL_TRENDS: Record<Goal, { muscle: number; fat: number }> = {
  muscle_gain: { muscle: 2, fat: 0.6 },
  fat_loss: { muscle: 0, fat: -2 },
  recomposition: { muscle: 1.2, fat: -1.2 },
  maintain: { muscle: 0.2, fat: -0.2 },
};
const CHART = { width: 300, height: 120, baseline: 60, unit: 20 };

function trendPath(trend: number): string {
  const end = CHART.baseline - trend * CHART.unit;
  return `M0 ${CHART.baseline} C110 ${CHART.baseline} 170 ${end} ${CHART.width} ${end}`;
}

function GoalChart({ goal }: { goal: Goal }) {
  const t = useTranslations("onboarding.goal");
  const trend = GOAL_TRENDS[goal];
  return (
    <figure className="grid gap-1">
      <p className="text-center text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--viz-2)" }}>
        {t("muscle")}
      </p>
      <svg viewBox={`0 0 ${CHART.width} ${CHART.height}`} role="img" aria-label={t("chart")} className="w-full">
        <line x1={0} y1={CHART.baseline} x2={CHART.width} y2={CHART.baseline} stroke="var(--border)" strokeWidth={1.5} />
        <path
          d={trendPath(trend.muscle)}
          fill="none"
          stroke="var(--viz-2)"
          strokeWidth={3}
          strokeLinecap="round"
          className="transition-[d] duration-300"
        />
        <path
          d={trendPath(trend.fat)}
          fill="none"
          stroke="var(--status-good)"
          strokeWidth={3}
          strokeLinecap="round"
          className="transition-[d] duration-300"
        />
      </svg>
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold tracking-wide uppercase" style={{ color: "var(--status-good)" }}>
          {t("fat")}
        </span>
        <span className="text-muted-foreground">{t("days")}</span>
      </div>
    </figure>
  );
}

export function GoalStep({ state, update, unitSystem, currentYear }: BodyStepProps) {
  const t = useTranslations();
  const bodyFat = state.bodyFatPercent ?? estimatedBodyFat(state, unitSystem, currentYear);
  const advisable = (goal: Goal) => isGoalAdvisable(goal, state.sex, bodyFat);
  return (
    <div className="grid gap-5">
      <GoalChart goal={state.goal} />
      <div role="radiogroup" aria-label={t("onboarding.goal.title")} className="grid gap-2.5">
        {GOALS.map((goal) => (
          <OptionCard
            key={goal}
            selected={state.goal === goal}
            onSelect={() => update({ goal })}
            title={t(`training.goals.${goal}`)}
            hint={state.goal === goal ? t(`training.goalHints.${goal}`) : undefined}
            trailing={
              advisable(goal) ? null : (
                <TriangleAlertIcon
                  className="size-5 shrink-0"
                  style={{ color: "var(--status-warning)" }}
                  role="img"
                  aria-label={t("onboarding.goal.warning")}
                />
              )
            }
          />
        ))}
      </div>
      {advisable(state.goal) ? null : (
        <p role="status" className="text-muted-foreground text-sm">
          {t("onboarding.goal.warningText")}
        </p>
      )}
    </div>
  );
}

export function FocusStep({ state, update }: StepProps) {
  const t = useTranslations();
  const [limitReached, setLimitReached] = useState(false);
  const full = state.focusMuscles.length >= MAX_FOCUS_MUSCLES;

  function pick(muscle: Muscle) {
    const next = toggleFocusMuscle(state.focusMuscles, muscle);
    setLimitReached(next === null);
    if (next) update({ focusMuscles: next });
  }

  const isSelected = (muscle: Muscle) => state.focusMuscles.includes(muscle);
  const fills = Object.fromEntries(
    MUSCLES.map((muscle) => [muscle, isSelected(muscle) ? "var(--tint)" : IDLE_FILL]),
  ) as Record<Muscle, string>;
  const labels = Object.fromEntries(
    MUSCLES.map((muscle) => [
      muscle,
      t(isSelected(muscle) ? "onboarding.focus.selected" : "onboarding.focus.notSelected", {
        name: t(`muscles.${muscle}`),
      }),
    ]),
  ) as Record<Muscle, string>;

  return (
    <div className="grid gap-5">
      <div className="mx-auto grid w-full max-w-64 grid-cols-2 gap-4">
        <MuscleMap view="front" label={t("onboarding.focus.front")} fills={fills} labels={labels} selected={null} onSelect={pick} />
        <MuscleMap view="back" label={t("onboarding.focus.back")} fills={fills} labels={labels} selected={null} onSelect={pick} />
      </div>
      <p role="status" className="text-sm font-medium empty:hidden" style={{ color: "var(--status-warning)" }}>
        {limitReached ? t("onboarding.focus.limit") : null}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {MUSCLES.map((muscle) => (
          <button
            key={muscle}
            type="button"
            role="checkbox"
            aria-checked={isSelected(muscle)}
            onClick={() => pick(muscle)}
            className={cn(
              "bg-card/70 min-h-11 rounded-lg border-2 px-3 text-sm font-medium transition-[color,border-color,opacity]",
              isSelected(muscle) ? "border-foreground" : "border-border",
              full && !isSelected(muscle) ? "opacity-45" : null,
            )}
          >
            {t(`muscles.${muscle}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
