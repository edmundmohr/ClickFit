"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { MarsIcon, VenusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MAX_BODY_FAT, MIN_BODY_FAT, bodyFatBand } from "@/domain/training/onboarding";
import { SEXES } from "@/domain/training/types";
import { weightUnitKey, type UnitSystem } from "@/lib/units";
import { OptionCard, RangeSlider, WheelPicker } from "./controls";
import {
  HEIGHT_RANGE_CM,
  MAX_AGE_YEARS,
  MIN_AGE_YEARS,
  WEIGHT_RANGE,
  estimatedBodyFat,
  range,
  type OnboardingState,
} from "./state";

export interface StepProps {
  state: OnboardingState;
  update: (patch: Partial<OnboardingState>) => void;
}

export interface BodyStepProps extends StepProps {
  unitSystem: UnitSystem;
  currentYear: number;
}

const SEX_ICONS = { male: MarsIcon, female: VenusIcon };

export function SexStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding.sex");
  return (
    <div role="radiogroup" aria-label={t("title")} className="mt-auto grid gap-3">
      {SEXES.map((sex) => {
        const Icon = SEX_ICONS[sex];
        return (
          <OptionCard
            key={sex}
            selected={state.sex === sex}
            onSelect={() => update({ sex })}
            title={t(sex)}
            icon={<Icon className="size-5 shrink-0" aria-hidden />}
          />
        );
      })}
    </div>
  );
}

export function BirthStep({ state, update, currentYear }: BodyStepProps) {
  const t = useTranslations("onboarding.birth");
  const years = useMemo(() => range(currentYear - MAX_AGE_YEARS, currentYear - MIN_AGE_YEARS), [currentYear]);
  return (
    <div className="my-auto">
      <WheelPicker
        values={years}
        value={state.birthYear}
        onChange={(birthYear) => update({ birthYear })}
        label={t("label")}
      />
    </div>
  );
}

const HEIGHTS = range(HEIGHT_RANGE_CM.min, HEIGHT_RANGE_CM.max);

export function HeightStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding.height");
  return (
    <div className="my-auto">
      <WheelPicker
        values={HEIGHTS}
        value={state.heightCm}
        onChange={(heightCm) => update({ heightCm })}
        label={t("label")}
        unit={t("unit")}
      />
    </div>
  );
}

export function WeightStep({ state, update, unitSystem }: BodyStepProps) {
  const t = useTranslations();
  const unit = t(`training.units.${weightUnitKey(unitSystem)}`);
  const weights = useMemo(() => range(WEIGHT_RANGE[unitSystem].min, WEIGHT_RANGE[unitSystem].max), [unitSystem]);
  return (
    <div className="my-auto">
      <WheelPicker
        values={weights}
        value={state.weight}
        onChange={(weight) => update({ weight })}
        label={t("onboarding.weight.label", { unit })}
        unit={unit}
      />
    </div>
  );
}

export function BodyFatStep({ state, update, unitSystem, currentYear }: BodyStepProps) {
  const t = useTranslations("onboarding.bodyFat");
  const estimate = estimatedBodyFat(state, unitSystem, currentYear);
  const percent = state.bodyFatPercent ?? estimate;
  const band = bodyFatBand(state.sex, percent);
  return (
    <div className="mt-auto grid gap-4">
      <div aria-live="polite">
        <p className="text-5xl font-bold tabular-nums">{t("value", { percent })}</p>
        <p className="text-muted-foreground mt-2 min-h-10 text-sm">{t(`bands.${state.sex}.${band}`)}</p>
      </div>
      <RangeSlider
        id="body-fat"
        label={t("label")}
        min={MIN_BODY_FAT}
        max={MAX_BODY_FAT}
        value={percent}
        onChange={(value) => update({ bodyFatPercent: value })}
        valueText={t("value", { percent })}
      />
      <div className="flex min-h-11 items-center justify-between gap-3">
        <p className="text-sm font-medium text-[var(--tint)]">{t("estimate", { percent: estimate })}</p>
        {percent !== estimate ? (
          <Button type="button" variant="outline" size="sm" onClick={() => update({ bodyFatPercent: null })}>
            {t("useEstimate")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
