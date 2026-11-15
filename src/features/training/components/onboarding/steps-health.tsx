"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip, FieldGroup } from "@/components/forms/choice";
import { WORK_POSTURES } from "@/domain/training/onboarding";
import { ACTIVITY_LEVELS, BODY_REGIONS, CARDIO_TYPES, type BodyRegion } from "@/domain/training/types";
import { BODY_OUTLINE, MAP_HEIGHT, MAP_WIDTH } from "@/features/progress/muscle-map-shapes";
import { Gauge, OptionCard } from "./controls";
import { toggle } from "./state";
import type { StepProps } from "./steps-profile";

/** Antippbare Stellen auf der Figur (Raster der Muskelkarte); paarige Regionen haben zwei Punkte. */
const PAIN_POINTS: Record<BodyRegion, readonly (readonly [number, number])[]> = {
  neck: [[100, 58]],
  shoulder: [
    [54, 82],
    [146, 82],
  ],
  elbow: [
    [46, 150],
    [154, 150],
  ],
  wrist: [
    [40, 208],
    [160, 208],
  ],
  lower_back: [[100, 176]],
  hip: [
    [80, 226],
    [120, 226],
  ],
  knee: [
    [82, 300],
    [118, 300],
  ],
  ankle: [
    [82, 386],
    [118, 386],
  ],
};
const POINT_RADIUS = 9;
/** Deckende Mischfarbe, damit sich überlappende Körperteile nicht doppelt abdunkeln. */
const FIGURE_FILL = "color-mix(in oklab, var(--foreground) 14%, var(--background))";
/** Unsichtbare Fläche um jeden Punkt, damit er sich mit dem Finger sicher treffen lässt. */
const TOUCH_RADIUS = 22;

export function PainStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding");
  const flip = (region: BodyRegion) => update({ injuries: toggle(state.injuries, region) });
  const onKey = (region: BodyRegion) => (event: KeyboardEvent) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    flip(region);
  };

  return (
    <div className="grid gap-5">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="group"
        aria-label={t("pain.figure")}
        className="mx-auto h-80 w-auto"
      >
        <g fill={FIGURE_FILL} stroke={FIGURE_FILL} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={BODY_OUTLINE.head.cx} cy={BODY_OUTLINE.head.cy} r={BODY_OUTLINE.head.r} stroke="none" />
          <rect {...BODY_OUTLINE.neck} stroke="none" />
          <path d={BODY_OUTLINE.torso} stroke="none" />
          {BODY_OUTLINE.limbs.map((limb) => (
            <path key={limb.d} d={limb.d} fill="none" strokeWidth={limb.width} />
          ))}
        </g>
        {BODY_REGIONS.map((region) => {
          const selected = state.injuries.includes(region);
          return (
            <g
              key={region}
              role="checkbox"
              tabIndex={0}
              aria-checked={selected}
              aria-label={t(`regions.${region}`)}
              onClick={() => flip(region)}
              onKeyDown={onKey(region)}
              className="cursor-pointer outline-none focus-visible:[&_circle[data-dot]]:stroke-[var(--ring)]"
            >
              {PAIN_POINTS[region].map(([cx, cy]) => (
                <g key={`${cx}-${cy}`}>
                  <circle cx={cx} cy={cy} r={TOUCH_RADIUS} fill="transparent" />
                  <circle
                    data-dot
                    cx={cx}
                    cy={cy}
                    r={POINT_RADIUS}
                    fill={selected ? "var(--status-critical)" : "var(--background)"}
                    stroke={selected ? "var(--status-critical)" : "var(--foreground)"}
                    strokeWidth={3}
                    strokeOpacity={selected ? 0.35 : 0.6}
                  />
                </g>
              ))}
            </g>
          );
        })}
      </svg>
      <div className="flex flex-wrap justify-center gap-2">
        {BODY_REGIONS.map((region) => (
          <Chip key={region} selected={state.injuries.includes(region)} onToggle={() => flip(region)}>
            {t(`regions.${region}`)}
          </Chip>
        ))}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="injury-note">{t("pain.note")}</Label>
        <Input
          id="injury-note"
          value={state.injuryNote}
          maxLength={500}
          onChange={(event) => update({ injuryNote: event.target.value })}
        />
      </div>
    </div>
  );
}

export function ActivityStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding");
  return (
    <div role="radiogroup" aria-label={t("activity.title")} className="grid gap-2.5">
      {ACTIVITY_LEVELS.map((level, index) => (
        <OptionCard
          key={level}
          selected={state.activityLevel === level}
          onSelect={() => update({ activityLevel: level })}
          title={t(`activity.${level}`)}
          hint={t(`activityHints.${level}`)}
          icon={<Gauge level={index} steps={ACTIVITY_LEVELS.length} />}
        />
      ))}
    </div>
  );
}

export function WorkStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding.work");
  return (
    <div role="group" aria-label={t("title")} className="grid gap-2.5">
      {WORK_POSTURES.map((posture) => {
        const selected = state.workPostures.includes(posture);
        return (
          <OptionCard
            key={posture}
            role="checkbox"
            selected={selected}
            onSelect={() => update({ workPostures: toggle(state.workPostures, posture) })}
            title={t(`options.${posture}`)}
            hint={t(`examples.${posture}`)}
            trailing={
              <span
                aria-hidden
                className={
                  selected
                    ? "border-foreground bg-foreground size-5 shrink-0 rounded-full border-2"
                    : "border-foreground/50 size-5 shrink-0 rounded-full border-2"
                }
              />
            }
          />
        );
      })}
    </div>
  );
}

const CARDIO_SESSION_OPTIONS = [1, 2, 3, 4, 5];

export function CardioStep({ state, update }: StepProps) {
  const t = useTranslations("onboarding");
  return (
    <div className="grid gap-6">
      <div role="radiogroup" aria-label={t("cardio.title")} className="grid grid-cols-2 gap-3">
        <OptionCard selected={state.cardioWanted} onSelect={() => update({ cardioWanted: true })} title={t("cardio.yes")} />
        <OptionCard selected={!state.cardioWanted} onSelect={() => update({ cardioWanted: false })} title={t("cardio.no")} />
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

export interface ExerciseOption {
  id: string;
  name: string;
}

const MAX_SEARCH_RESULTS = 8;

export function ExcludedStep({ state, update, exercises }: StepProps & { exercises: ExerciseOption[] }) {
  const t = useTranslations("onboarding.excluded");
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
    <div className="grid gap-3">
      <Input
        type="search"
        aria-label={t("search")}
        placeholder={t("search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {results.length > 0 ? (
        <ul className="bg-card/70 divide-y rounded-lg border">
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
      <p className="text-sm">{t("count", { count: state.excludedExerciseIds.length })}</p>
      <ul className="flex flex-wrap gap-2">
        {state.excludedExerciseIds.map((id) => {
          const name = byId.get(id) ?? id;
          return (
            <li key={id}>
              <button
                type="button"
                aria-label={t("remove", { name })}
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
    </div>
  );
}
