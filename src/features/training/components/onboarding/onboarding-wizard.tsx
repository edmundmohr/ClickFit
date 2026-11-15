"use client";

import { useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CheckIcon, ChevronLeftIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormError } from "@/components/forms/form-error";
import type { LocationType } from "@/domain/training/types";
import { enablePush, getPushState, type PushState } from "@/features/notifications/push-client";
import type { ErrorCode } from "@/lib/errors";
import type { UnitSystem } from "@/lib/units";
import { completeOnboardingAction } from "../../actions";
import {
  SECTIONS,
  SECTION_TINTS,
  STEPS,
  toOnboardingInput,
  type OnboardingState,
  type SectionId,
  type StepId,
} from "./state";
import { AssessmentStep, FocusStep, GoalStep, TrainingAgeStep } from "./steps-goals";
import { ActivityStep, CardioStep, ExcludedStep, PainStep, WorkStep, type ExerciseOption } from "./steps-health";
import { FrequencyStep, LocationStep, ReminderStep, WeekStep } from "./steps-needs";
import { BirthStep, BodyFatStep, HeightStep, SexStep, WeightStep } from "./steps-profile";

interface OnboardingWizardProps {
  initialState: OnboardingState;
  unitSystem: UnitSystem;
  currentYear: number;
  exercises: ExerciseOption[];
  defaultEquipment: Record<LocationType, OnboardingState["equipment"]>;
  /** Fehlt der Schlüssel, ist Web Push nicht eingerichtet und die Frage dazu entfällt. */
  pushPublicKey?: string;
}

/** Fragen mit erklärendem Satz unter der Überschrift. */
const STEPS_WITH_HINT = [
  "sex",
  "birth",
  "height",
  "weight",
  "bodyFat",
  "trainingAge",
  "assessment",
  "focus",
  "reminder",
  "pain",
  "work",
  "excluded",
] as const satisfies readonly StepId[];

export function OnboardingWizard({
  initialState,
  unitSystem,
  currentYear,
  exercises,
  defaultEquipment,
  pushPublicKey,
}: OnboardingWizardProps) {
  const t = useTranslations("onboarding");
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [stepId, setStepId] = useState<StepId>(STEPS[0].id);
  /** Zwischenbild beim Wechsel in den nächsten Abschnitt. */
  const [intro, setIntro] = useState<SectionId | null>(null);
  const [showReminder, setShowReminder] = useState(false);
  const [reminderFailed, setReminderFailed] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [submitError, setSubmitError] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();
  const [finished, setFinished] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // Die Frage nach Benachrichtigungen gibt es nur, wenn sie sich hier einschalten lassen.
  useEffect(() => {
    if (!pushPublicKey) return;
    let active = true;
    getPushState()
      .then((pushState) => {
        if (active) setShowReminder(pushState === "inactive");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pushPublicKey]);

  const steps = STEPS.filter((item) => item.id !== "reminder" || showReminder);
  const index = Math.max(
    0,
    steps.findIndex((item) => item.id === stepId),
  );
  const step = steps[index];
  const isLast = index === steps.length - 1;
  const section = intro ?? step.section;
  const sectionIndex = SECTIONS.indexOf(section);

  // Neue Frage: nach oben rollen und die Überschrift für Screenreader ansteuern.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [stepId, intro]);

  const update = (patch: Partial<OnboardingState>) => setState((current) => ({ ...current, ...patch }));

  function submit() {
    setSubmitError(null);
    startTransition(async () => {
      const result = await completeOnboardingAction(toOnboardingInput(state, unitSystem, currentYear));
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      setFinished(true);
      toast.success(t("done"));
      router.replace("/training");
    });
  }

  function next() {
    if (intro) {
      setIntro(null);
      return;
    }
    if (isLast) {
      submit();
      return;
    }
    const following = steps[index + 1];
    setStepId(following.id);
    if (following.section !== step.section) setIntro(following.section);
  }

  function back() {
    if (index === 0) {
      router.push("/");
      return;
    }
    // Vom Zwischenbild aus geht es zur letzten Frage des vorigen Abschnitts.
    setIntro(null);
    setStepId(steps[index - 1].id);
  }

  async function acceptReminder() {
    if (!pushPublicKey) return;
    setEnabling(true);
    const result = await enablePush(pushPublicKey).catch((): PushState => "inactive");
    setEnabling(false);
    if (result === "enabled") next();
    else setReminderFailed(true);
  }

  const tint = { "--tint": SECTION_TINTS[section] } as CSSProperties;
  const background: CSSProperties = {
    background:
      "linear-gradient(to bottom, color-mix(in oklab, var(--tint) 18%, var(--background)), var(--background) 60%)",
  };

  if (pending || finished) {
    return (
      <div style={{ ...tint, ...background }} className="flex h-dvh flex-col justify-center gap-4 px-6">
        <Loader2Icon className="size-16 animate-spin text-[var(--tint)]" aria-hidden />
        <h1 role="status" className="text-2xl font-bold">
          {t("creating.title")}
        </h1>
        <p className="text-muted-foreground">{t("creating.text")}</p>
      </div>
    );
  }

  const stepProps = { state, update };
  const bodyProps = { ...stepProps, unitSystem, currentYear };
  const isReminder = !intro && step.id === "reminder";
  const hintStep = STEPS_WITH_HINT.find((id) => id === step.id);

  return (
    <div style={{ ...tint, ...background }} className="flex h-dvh flex-col">
      <header className="mx-auto w-full max-w-lg px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <div className="flex h-11 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-ml-2 size-11"
            aria-label={index === 0 ? t("close") : t("back")}
            onClick={back}
          >
            <ChevronLeftIcon className="size-6" aria-hidden />
          </Button>
          <span
            className="rounded-md px-2 py-1 text-xs font-bold tracking-wide text-[var(--tint)] uppercase"
            style={{ background: "color-mix(in oklab, var(--tint) 18%, transparent)" }}
          >
            {t(`sections.${section}`)}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={steps.length}
          aria-valuenow={index + 1}
          aria-valuetext={t("progress", { current: index + 1, total: steps.length })}
          className="mt-2 flex items-center gap-1.5"
        >
          {SECTIONS.map((id, position) => {
            const own = steps.filter((item) => item.section === id);
            const done = position < sectionIndex;
            const reached = intro ? 0 : own.findIndex((item) => item.id === step.id) + 1;
            const share = done ? 1 : position === sectionIndex ? reached / own.length : 0;
            return (
              <div key={id} className="flex items-center gap-1.5" style={{ flexGrow: own.length, flexBasis: 0 }}>
                <div className="bg-foreground/15 h-1.5 flex-1 overflow-hidden rounded-full">
                  <div
                    className="bg-foreground h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${share * 100}%` }}
                  />
                </div>
                {done ? <CheckIcon className="size-3.5 shrink-0" aria-hidden /> : null}
              </div>
            );
          })}
        </div>
      </header>

      <div ref={contentRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col gap-5 px-4 pt-5 pb-4">
          {intro ? (
            <div className="my-auto grid gap-4">
              <span aria-hidden className="size-20 animate-pulse rounded-full border-[6px] border-[var(--tint)]" />
              <p className="text-lg">{t(`intro.${intro === "profile" ? "goals" : intro}`)}</p>
              <div>
                <p className="text-muted-foreground">{t("intro.upNext")}</p>
                <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-black tracking-wide uppercase outline-none">
                  {t(`sections.${intro}`)}
                </h1>
              </div>
            </div>
          ) : (
            <>
              <div className="grid gap-1.5">
                <h1 ref={headingRef} tabIndex={-1} className="text-2xl leading-tight font-bold outline-none">
                  {t(`${step.id}.title`)}
                </h1>
                {hintStep ? <p className="text-muted-foreground text-sm">{t(`${hintStep}.hint`)}</p> : null}
              </div>
              {step.id === "sex" ? <SexStep {...stepProps} /> : null}
              {step.id === "birth" ? <BirthStep {...bodyProps} /> : null}
              {step.id === "height" ? <HeightStep {...stepProps} /> : null}
              {step.id === "weight" ? <WeightStep {...bodyProps} /> : null}
              {step.id === "bodyFat" ? <BodyFatStep {...bodyProps} /> : null}
              {step.id === "trainingAge" ? <TrainingAgeStep {...stepProps} /> : null}
              {step.id === "assessment" ? <AssessmentStep {...stepProps} /> : null}
              {step.id === "goal" ? <GoalStep {...bodyProps} /> : null}
              {step.id === "focus" ? <FocusStep {...stepProps} /> : null}
              {step.id === "frequency" ? <FrequencyStep {...stepProps} /> : null}
              {step.id === "location" ? <LocationStep {...stepProps} defaultEquipment={defaultEquipment} /> : null}
              {step.id === "week" ? <WeekStep {...stepProps} /> : null}
              {step.id === "reminder" ? <ReminderStep failed={reminderFailed} /> : null}
              {step.id === "pain" ? <PainStep {...stepProps} /> : null}
              {step.id === "activity" ? <ActivityStep {...stepProps} /> : null}
              {step.id === "work" ? <WorkStep {...stepProps} /> : null}
              {step.id === "cardio" ? <CardioStep {...stepProps} /> : null}
              {step.id === "excluded" ? <ExcludedStep {...stepProps} exercises={exercises} /> : null}
              <FormError code={submitError} />
            </>
          )}
        </div>
      </div>

      <footer className="mx-auto grid w-full max-w-lg gap-2 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        {isReminder ? (
          <>
            <Button type="button" variant="secondary" className="h-14 rounded-xl text-base" onClick={next}>
              {t("reminder.later")}
            </Button>
            <Button type="button" className="h-14 rounded-xl text-base" disabled={enabling} onClick={acceptReminder}>
              {enabling ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
              {t("reminder.accept")}
            </Button>
          </>
        ) : (
          <Button type="button" className="h-14 rounded-xl text-base font-semibold" onClick={next}>
            {isLast && !intro ? t("finish") : t("next")}
          </Button>
        )}
      </footer>
    </div>
  );
}
