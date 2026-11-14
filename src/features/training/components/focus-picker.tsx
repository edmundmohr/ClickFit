"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Chip, FieldGroup } from "@/components/forms/choice";
import { FOCUS_AREAS, FOCUS_MINUTES, type FocusArea, type FocusMinutes } from "@/domain/training/focus-day";
import { cn } from "@/lib/utils";

interface FocusPickerProps {
  areas: FocusArea[];
  minutes: FocusMinutes;
  readiness: Record<FocusArea, number>;
  /** Die Vorschau; sie wird beim Neuberechnen abgeblendet. */
  children: ReactNode;
}

/**
 * Auswahl der Körperregionen und der Dauer. Jede Änderung landet in der URL, die Seite stellt
 * die Einheit dann auf dem Server neu zusammen.
 */
export function FocusPicker({ areas, minutes, readiness, children }: FocusPickerProps) {
  const t = useTranslations("training.focusTraining");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState(areas);
  const [duration, setDuration] = useState(minutes);

  const navigate = (nextAreas: FocusArea[], nextMinutes: FocusMinutes) => {
    const params = new URLSearchParams();
    if (nextAreas.length > 0) params.set("areas", nextAreas.join(","));
    params.set("minutes", String(nextMinutes));
    startTransition(() => router.replace(`/training/focus?${params.toString()}`, { scroll: false }));
  };

  const toggleArea = (area: FocusArea) => {
    const next = FOCUS_AREAS.filter((item) => (item === area ? !selected.includes(item) : selected.includes(item)));
    setSelected(next);
    navigate(next, duration);
  };

  const chooseMinutes = (value: FocusMinutes) => {
    setDuration(value);
    navigate(selected, value);
  };

  return (
    <div className="grid gap-6">
      <FieldGroup label={t("areasLabel")} hint={t("areasHint")}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {FOCUS_AREAS.map((area) => (
            <Chip
              key={area}
              selected={selected.includes(area)}
              onToggle={() => toggleArea(area)}
              className="flex h-auto min-h-14 flex-col items-center justify-center rounded-xl py-2"
            >
              <span>{t(`areas.${area}`)}</span>
              <span className="text-xs font-normal opacity-80">{t("ready", { percent: readiness[area] })}</span>
            </Chip>
          ))}
        </div>
      </FieldGroup>
      <FieldGroup label={t("minutesLabel")}>
        <div role="radiogroup" aria-label={t("minutesLabel")} className="flex flex-wrap gap-2">
          {FOCUS_MINUTES.map((value) => (
            <Chip key={value} role="radio" selected={duration === value} onToggle={() => chooseMinutes(value)}>
              {t("minutes", { minutes: value })}
            </Chip>
          ))}
        </div>
      </FieldGroup>
      <div aria-busy={pending} className={cn("transition-opacity", pending && "opacity-50")}>
        {children}
      </div>
    </div>
  );
}
