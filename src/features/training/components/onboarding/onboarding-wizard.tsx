"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, ArrowRightIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/forms/form-error";
import type { LocationType } from "@/domain/training/types";
import type { ErrorCode } from "@/lib/errors";
import type { UnitSystem } from "@/lib/units";
import { completeOnboardingAction } from "../../actions";
import { STEPS, toOnboardingInput, validateStep, type OnboardingState, type StepError } from "./state";
import { ExperienceStep, GoalStep, LocationStep, ScheduleStep } from "./steps-basic";
import { BodyStep, CardioStep, LimitsStep, type ExerciseOption } from "./steps-details";

interface OnboardingWizardProps {
  initialState: OnboardingState;
  unitSystem: UnitSystem;
  exercises: ExerciseOption[];
  defaultEquipment: Record<LocationType, OnboardingState["equipment"]>;
}

export function OnboardingWizard({ initialState, unitSystem, exercises, defaultEquipment }: OnboardingWizardProps) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [stepIndex, setStepIndex] = useState(0);
  const [stepError, setStepError] = useState<StepError>(null);
  const [submitError, setSubmitError] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const update = (patch: Partial<OnboardingState>) => {
    setState((current) => ({ ...current, ...patch }));
    setStepError(null);
  };

  function goTo(index: number) {
    setStepIndex(index);
    setStepError(null);
    window.scrollTo({ top: 0 });
  }

  function submit() {
    const input = toOnboardingInput(state, unitSystem);
    if (!input) {
      setStepError("body");
      return;
    }
    setSubmitError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction(input);
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      toast.success(t("done"));
      router.replace("/training");
    });
  }

  function next() {
    const error = validateStep(step, state, unitSystem);
    if (error) {
      setStepError(error);
      return;
    }
    if (isLast) submit();
    else goTo(stepIndex + 1);
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <p className="text-muted-foreground text-sm">{t("step", { current: stepIndex + 1, total: STEPS.length })}</p>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={stepIndex + 1}
          className="bg-secondary h-1.5 overflow-hidden rounded-full"
        >
          <div
            className="bg-primary h-full rounded-full transition-all"
            style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <h2 className="pt-2 text-xl font-semibold">{t(`${step}.title`)}</h2>
      </div>

      {step === "goal" ? <GoalStep state={state} update={update} /> : null}
      {step === "experience" ? <ExperienceStep state={state} update={update} /> : null}
      {step === "schedule" ? <ScheduleStep state={state} update={update} /> : null}
      {step === "location" ? (
        <LocationStep state={state} update={update} defaultEquipment={defaultEquipment} />
      ) : null}
      {step === "cardio" ? <CardioStep state={state} update={update} /> : null}
      {step === "body" ? <BodyStep state={state} update={update} unitSystem={unitSystem} /> : null}
      {step === "limits" ? <LimitsStep state={state} update={update} exercises={exercises} /> : null}

      {stepError ? (
        <p role="alert" className="text-destructive text-sm">
          {t(`errors.${stepError}`)}
        </p>
      ) : null}
      <FormError code={submitError} />

      <div className="flex gap-3">
        {stepIndex > 0 ? (
          <Button type="button" variant="outline" size="lg" disabled={pending} onClick={() => goTo(stepIndex - 1)}>
            <ArrowLeftIcon aria-hidden />
            {t("back")}
          </Button>
        ) : null}
        <Button type="button" size="lg" className="flex-1" disabled={pending} onClick={next}>
          {pending ? (
            <>
              <Loader2Icon className="animate-spin" aria-hidden />
              {t("finishing")}
            </>
          ) : isLast ? (
            t("finish")
          ) : (
            <>
              {t("next")}
              <ArrowRightIcon aria-hidden />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
