"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeftRightIcon, BellIcon, DumbbellIcon, HouseIcon, LuggageIcon, PencilIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Chip, FieldGroup } from "@/components/forms/choice";
import { EQUIPMENT } from "@/domain/exercises/types";
import {
  defaultWeekdays,
  experienceFromAssessment,
  moveTrainingDay,
  recommendedDayCounts,
} from "@/domain/training/onboarding";
import { chooseSplit } from "@/domain/training/plan-generator/templates";
import {
  LOCATION_TYPES,
  MAX_TRAINING_DAYS,
  MIN_TRAINING_DAYS,
  SESSION_MINUTES,
  WEEKDAYS,
  type LocationType,
  type SessionMinutes,
  type Weekday,
} from "@/domain/training/types";
import { cn } from "@/lib/utils";
import { OptionCard, RangeSlider } from "./controls";
import { range, toggle, type OnboardingState } from "./state";
import type { StepProps } from "./steps-profile";

const DAY_COUNTS = range(MIN_TRAINING_DAYS, MAX_TRAINING_DAYS);

export function FrequencyStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding.frequency");
  const [pending, setPending] = useState<number | null>(null);
  const recommended = recommendedDayCounts(experienceFromAssessment(state.selfAssessment));

  // Bestehende Wochentage bleiben, wenn sich die Anzahl nicht ändert.
  const apply = (count: number) => {
    if (count !== state.weekdays.length) update({ weekdays: defaultWeekdays(count) });
  };

  return (
    <>
      <div role="radiogroup" aria-label={t("title")} className="grid gap-2.5">
        {DAY_COUNTS.map((count) => (
          <OptionCard
            key={count}
            selected={state.weekdays.length === count}
            onSelect={() => (recommended.includes(count) ? apply(count) : setPending(count))}
            title={t("option", { count })}
            trailing={
              recommended.includes(count) ? (
                <span className="text-xs font-semibold tracking-wide text-[var(--tint)] uppercase">
                  {t("recommended")}
                </span>
              ) : null
            }
          />
        ))}
      </div>
      <AlertDialog open={pending !== null} onOpenChange={(open) => (open ? null : setPending(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("confirmText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("confirmNo")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => (pending === null ? null : apply(pending))}>
              {t("confirmYes")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const LOCATION_ICONS: Record<LocationType, typeof DumbbellIcon> = {
  gym: DumbbellIcon,
  home: HouseIcon,
  travel: LuggageIcon,
};

interface LocationStepProps extends StepProps {
  defaultEquipment: Record<LocationType, OnboardingState["equipment"]>;
}

export function LocationStep({ state, update, defaultEquipment }: LocationStepProps) {
  const t = useTranslations();
  const [customizing, setCustomizing] = useState(false);
  return (
    <div className="grid gap-5">
      <div role="radiogroup" aria-label={t("onboarding.location.title")} className="grid gap-2.5">
        {LOCATION_TYPES.map((type) => {
          const Icon = LOCATION_ICONS[type];
          return (
            <OptionCard
              key={type}
              selected={state.locationType === type}
              onSelect={() => update({ locationType: type, equipment: defaultEquipment[type] })}
              title={t(`training.locations.${type}`)}
              hint={t(`training.locationHints.${type}`)}
              icon={<Icon className="size-5 shrink-0" aria-hidden />}
            />
          );
        })}
      </div>
      {customizing ? (
        <FieldGroup label={t("onboarding.location.equipment")} hint={t("onboarding.location.equipmentHint")}>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT.map((item) => (
              <Chip
                key={item}
                selected={state.equipment.includes(item)}
                onToggle={() => update({ equipment: toggle(state.equipment, item) })}
              >
                {t(`equipment.${item}`)}
              </Chip>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => update({ equipment: [...EQUIPMENT] })}>
              {t("onboarding.location.selectAll")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => update({ equipment: [] })}>
              {t("onboarding.location.selectNone")}
            </Button>
          </div>
        </FieldGroup>
      ) : (
        <Button type="button" variant="link" className="justify-self-center" onClick={() => setCustomizing(true)}>
          <PencilIcon aria-hidden />
          {t("onboarding.location.customize")}
        </Button>
      )}
    </div>
  );
}

const MINUTES_STEP = SESSION_MINUTES[1] - SESSION_MINUTES[0];

export function WeekStep({ state, update }: StepProps) {
  const t = useTranslations();
  const [moving, setMoving] = useState<Weekday | null>(null);
  const { split } = chooseSplit(state.weekdays.length, {
    experience: experienceFromAssessment(state.selfAssessment),
    sessionMinutes: state.sessionMinutes,
    equipment: state.equipment,
  });

  function tap(day: Weekday) {
    if (state.weekdays.includes(day)) {
      setMoving(moving === day ? null : day);
      return;
    }
    if (moving === null) return;
    update({ weekdays: moveTrainingDay(state.weekdays, moving, day) });
    setMoving(null);
  }

  const minutesText = t("onboarding.week.minutes", { count: state.sessionMinutes });
  return (
    <div className="grid flex-1 content-between gap-8">
      <div className="grid gap-4">
        <p className="flex items-center gap-2 font-medium">
          <span aria-hidden className="size-3 rounded-full bg-[var(--tint)]" />
          {t(`training.splits.${split}`)}
        </p>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((day) => {
            const isTraining = state.weekdays.includes(day);
            const name = t(`training.weekdays.${day}`);
            const label = isTraining
              ? t("onboarding.week.training", { day: name })
              : t(moving === null ? "onboarding.week.free" : "onboarding.week.moveTo", { day: name });
            return (
              <button
                key={day}
                type="button"
                aria-label={label}
                aria-pressed={isTraining ? moving === day : undefined}
                disabled={!isTraining && moving === null}
                onClick={() => tap(day)}
                className={cn(
                  "bg-foreground/10 relative flex h-24 flex-col items-center overflow-hidden rounded-full border-2 pt-3 text-sm font-semibold transition-colors",
                  moving === day ? "border-[var(--tint)]" : "border-transparent",
                  moving !== null && !isTraining ? "border-foreground/30 border-dashed" : null,
                )}
              >
                {t(`training.weekdaysShort.${day}`)}
                {isTraining ? (
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-7 rounded-t-[50%] bg-[var(--tint)]" />
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="text-muted-foreground flex min-h-6 items-center gap-2 text-sm">
          <ArrowLeftRightIcon className="size-4 shrink-0" aria-hidden />
          {t("onboarding.week.hint")}
        </p>
      </div>
      <div className="grid gap-1">
        <p className="text-2xl font-bold" aria-live="polite">
          {minutesText}
        </p>
        <p className="text-muted-foreground text-sm">{t("onboarding.week.duration")}</p>
        <RangeSlider
          id="session-minutes"
          label={t("onboarding.week.duration")}
          min={SESSION_MINUTES[0]}
          max={SESSION_MINUTES[SESSION_MINUTES.length - 1]}
          step={MINUTES_STEP}
          value={state.sessionMinutes}
          onChange={(value) => {
            const minutes = SESSION_MINUTES.find((option): option is SessionMinutes => option === value);
            if (minutes) update({ sessionMinutes: minutes });
          }}
          valueText={minutesText}
        />
      </div>
    </div>
  );
}

/** Vorschau einer Benachrichtigung; die Knöpfe dazu stehen in der Fußzeile des Fragebogens. */
export function ReminderStep({ failed }: { failed: boolean }) {
  const t = useTranslations("onboarding.reminder");
  return (
    <div className="my-auto grid gap-4">
      <div className="bg-card/80 flex items-start gap-3 rounded-2xl border p-4 shadow-lg">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--tint)] text-black">
          <BellIcon className="size-5" aria-hidden />
        </span>
        <div className="grid flex-1 gap-0.5">
          <p className="flex items-baseline justify-between gap-2 font-semibold">
            {t("sampleTitle")}
            <span className="text-muted-foreground text-xs font-normal">{t("sampleTime")}</span>
          </p>
          <p className="text-sm">{t("sampleText")}</p>
        </div>
      </div>
      {failed ? (
        <p role="alert" className="text-muted-foreground text-sm">
          {t("failed")}
        </p>
      ) : null}
    </div>
  );
}
