"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, ChoiceCard, FieldGroup } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import { ACTIVITY_LEVELS, BODY_REGIONS, CARDIO_TYPES, SEXES } from "@/domain/training/types";
import { weightUnitKey, type UnitSystem } from "@/lib/units";
import { toggle } from "./state";
import type { StepProps } from "./steps-basic";

const CARDIO_SESSION_OPTIONS = [1, 2, 3, 4, 5];
const MAX_SEARCH_RESULTS = 8;

export function CardioStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding");
  return (
    <div className="grid gap-6">
      <div role="radiogroup" className="grid grid-cols-2 gap-3">
        <ChoiceCard selected={state.cardioWanted} onSelect={() => update({ cardioWanted: true })} title={t("cardio.yes")} />
        <ChoiceCard selected={!state.cardioWanted} onSelect={() => update({ cardioWanted: false })} title={t("cardio.no")} />
      </div>
      {state.cardioWanted ? (
        <>
          <FieldGroup label={t("cardio.types")}>
            <div className="flex flex-wrap gap-2">
              {CARDIO_TYPES.map((type) => (
                <Chip
                  key={type}
                  selected={state.cardioTypes.includes(type)}
                  onToggle={() => update({ cardioTypes: toggle(state.cardioTypes, type) })}
                >
                  {t(`cardioTypes.${type}`)}
                </Chip>
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label={t("cardio.frequency")} hint={t("cardio.hint")}>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {CARDIO_SESSION_OPTIONS.map((count) => (
                <Chip
                  key={count}
                  role="radio"
                  selected={state.cardioSessions === count}
                  onToggle={() => update({ cardioSessions: count })}
                  className="min-w-11 px-0"
                >
                  {count}
                </Chip>
              ))}
            </div>
          </FieldGroup>
        </>
      ) : null}
    </div>
  );
}

export function BodyStep({ state, update, unitSystem }: StepProps & { unitSystem: UnitSystem }) {
  const t = useTranslations();
  const unit = t(`training.units.${weightUnitKey(unitSystem)}`);
  return (
    <div className="grid gap-5">
      <p className="text-muted-foreground text-sm">{t("onboarding.body.hint")}</p>
      <FieldGroup label={t("onboarding.body.sex")}>
        <div role="radiogroup" className="grid grid-cols-2 gap-3">
          {SEXES.map((sex) => (
            <ChoiceCard
              key={sex}
              selected={state.sex === sex}
              onSelect={() => update({ sex })}
              title={t(`onboarding.body.sexes.${sex}`)}
            />
          ))}
        </div>
      </FieldGroup>
      <div className="grid grid-cols-3 gap-3">
        <Field
          id="birth-year"
          label={t("onboarding.body.birthYear")}
          inputMode="numeric"
          value={state.birthYear}
          onChange={(event) => update({ birthYear: event.target.value })}
        />
        <Field
          id="height"
          label={t("onboarding.body.height")}
          inputMode="decimal"
          value={state.heightCm}
          onChange={(event) => update({ heightCm: event.target.value })}
        />
        <Field
          id="weight"
          label={t("onboarding.body.weight", { unit })}
          inputMode="decimal"
          value={state.weight}
          onChange={(event) => update({ weight: event.target.value })}
        />
      </div>
      <FieldGroup label={t("onboarding.body.activity")}>
        <div role="radiogroup" className="grid gap-2">
          {ACTIVITY_LEVELS.map((level) => (
            <ChoiceCard
              key={level}
              selected={state.activityLevel === level}
              onSelect={() => update({ activityLevel: level })}
              title={t(`onboarding.activity.${level}`)}
            />
          ))}
        </div>
      </FieldGroup>
    </div>
  );
}

export interface ExerciseOption {
  id: string;
  name: string;
}

export function LimitsStep({ state, update, exercises }: StepProps & { exercises: ExerciseOption[] }) {
  const t = useTranslations("onboarding");
  const [query, setQuery] = useState("");
  const byId = useMemo(() => new Map(exercises.map((exercise) => [exercise.id, exercise.name])), [exercises]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length < 2) return [];
    return exercises
      .filter((exercise) => !state.excludedExerciseIds.includes(exercise.id) && exercise.name.toLowerCase().includes(needle))
      .slice(0, MAX_SEARCH_RESULTS);
  }, [query, exercises, state.excludedExerciseIds]);

  return (
    <div className="grid gap-6">
      <p className="text-muted-foreground text-sm">{t("limits.hint")}</p>
      <FieldGroup label={t("limits.injuries")} hint={t("limits.injuriesHint")}>
        <div className="flex flex-wrap gap-2">
          {BODY_REGIONS.map((region) => (
            <Chip
              key={region}
              selected={state.injuries.includes(region)}
              onToggle={() => update({ injuries: toggle(state.injuries, region) })}
            >
              {t(`regions.${region}`)}
            </Chip>
          ))}
        </div>
      </FieldGroup>
      <div className="grid gap-2">
        <Label htmlFor="injury-note">{t("limits.note")}</Label>
        <Input
          id="injury-note"
          value={state.injuryNote}
          maxLength={500}
          onChange={(event) => update({ injuryNote: event.target.value })}
        />
      </div>
      <FieldGroup label={t("limits.excluded")} hint={t("limits.excludedHint")}>
        <Input
          type="search"
          aria-label={t("limits.excludedSearch")}
          placeholder={t("limits.excludedSearch")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {results.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {results.map((exercise) => (
              <li key={exercise.id}>
                <button
                  type="button"
                  className="hover:bg-accent/60 min-h-11 w-full px-3 text-left text-sm"
                  onClick={() => {
                    update({ excludedExerciseIds: [...state.excludedExerciseIds, exercise.id] });
                    setQuery("");
                  }}
                >
                  {exercise.name}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-sm">{t("limits.excludedCount", { count: state.excludedExerciseIds.length })}</p>
        <ul className="flex flex-wrap gap-2">
          {state.excludedExerciseIds.map((id) => {
            const name = byId.get(id) ?? id;
            return (
              <li key={id}>
                <button
                  type="button"
                  aria-label={t("limits.remove", { name })}
                  onClick={() => update({ excludedExerciseIds: state.excludedExerciseIds.filter((item) => item !== id) })}
                  className="bg-secondary flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm"
                >
                  {name}
                  <XIcon className="size-4" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </FieldGroup>
    </div>
  );
}
