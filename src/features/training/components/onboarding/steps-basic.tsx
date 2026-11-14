"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Chip, ChoiceCard, FieldGroup } from "@/components/forms/choice";
import { EQUIPMENT } from "@/domain/exercises/types";
import {
  EXPERIENCE_LEVELS,
  GOALS,
  LOCATION_TYPES,
  SESSION_MINUTES,
  WEEKDAYS,
  type LocationType,
} from "@/domain/training/types";
import { toggle, type OnboardingState } from "./state";

export interface StepProps {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
}

export function GoalStep({ state, update }: StepProps) {
  const t = useTranslations("training");
  return (
    <div role="radiogroup" className="grid gap-3">
      {GOALS.map((goal) => (
        <ChoiceCard
          key={goal}
          selected={state.goal === goal}
          onSelect={() => update({ goal })}
          title={t(`goals.${goal}`)}
          hint={t(`goalHints.${goal}`)}
        />
      ))}
    </div>
  );
}

export function ExperienceStep({ state, update }: StepProps) {
  const t = useTranslations("training");
  return (
    <div role="radiogroup" className="grid gap-3">
      {EXPERIENCE_LEVELS.map((level) => (
        <ChoiceCard
          key={level}
          selected={state.experience === level}
          onSelect={() => update({ experience: level })}
          title={t(`experience.${level}`)}
          hint={t(`experienceHints.${level}`)}
        />
      ))}
    </div>
  );
}

export function ScheduleStep({ state, update }: StepProps) {
  const t = useTranslations();
  return (
    <div className="grid gap-6">
      <FieldGroup
        label={t("onboarding.schedule.days")}
        hint={t("onboarding.schedule.daysHint", { count: state.weekdays.length })}
      >
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((day) => (
            <Chip
              key={day}
              selected={state.weekdays.includes(day)}
              onToggle={() => update({ weekdays: toggle(state.weekdays, day) })}
              className="px-0"
            >
              {t(`training.weekdaysShort.${day}`)}
            </Chip>
          ))}
        </div>
      </FieldGroup>
      <FieldGroup label={t("onboarding.schedule.duration")}>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {SESSION_MINUTES.map((minutes) => (
            <Chip
              key={minutes}
              role="radio"
              selected={state.sessionMinutes === minutes}
              onToggle={() => update({ sessionMinutes: minutes })}
            >
              {t("training.units.minutes", { count: minutes })}
            </Chip>
          ))}
        </div>
      </FieldGroup>
    </div>
  );
}

interface LocationStepProps extends StepProps {
  defaultEquipment: Record<LocationType, OnboardingState["equipment"]>;
}

export function LocationStep({ state, update, defaultEquipment }: LocationStepProps) {
  const t = useTranslations();
  return (
    <div className="grid gap-6">
      <div role="radiogroup" className="grid gap-3">
        {LOCATION_TYPES.map((type) => (
          <ChoiceCard
            key={type}
            selected={state.locationType === type}
            onSelect={() => update({ locationType: type, equipment: defaultEquipment[type] })}
            title={t(`training.locations.${type}`)}
            hint={t(`training.locationHints.${type}`)}
          />
        ))}
      </div>
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
    </div>
  );
}
