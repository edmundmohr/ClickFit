"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/forms/choice";
import { Button } from "@/components/ui/button";
import { EFFORT_LEVELS, MAX_FEEDBACK_RIR, type ExerciseFeedback } from "@/domain/training/types";

const RIR_OPTIONS = Array.from({ length: MAX_FEEDBACK_RIR + 1 }, (_, index) => index);
const EMPTY: ExerciseFeedback = { effort: null, rir: null };

interface ExerciseCheckInProps {
  feedback: ExerciseFeedback | null;
  /** Nach dem letzten Satz von selbst nachfragen (laufendes Training, Abfrage eingeschaltet). */
  ask: boolean;
  onChange: (feedback: ExerciseFeedback) => void;
}

/**
 * Freiwillige Abfrage nach der Übung: Anstrengung und RIR. Jeder Tipp speichert sofort; sind
 * beide Angaben gemacht, klappt die Abfrage zu einer Zeile zusammen.
 */
export function ExerciseCheckIn({ feedback, ask, onChange }: ExerciseCheckInProps) {
  const t = useTranslations("workout.checkIn");
  const rirLabelId = useId();
  // `null`: Die Anzeige folgt dem Stand (offen, solange etwas fehlt und gefragt werden soll).
  const [open, setOpen] = useState<boolean | null>(null);
  const current = feedback ?? EMPTY;
  const complete = current.effort !== null && current.rir !== null;
  const expanded = open ?? (ask && !complete);

  const update = (patch: Partial<ExerciseFeedback>) => {
    const next = { ...current, ...patch };
    onChange(next);
    // Beide Angaben gemacht: zusammenklappen, damit es mit der nächsten Übung weitergeht.
    if (next.effort !== null && next.rir !== null) setOpen(false);
  };

  if (!expanded) {
    if (!feedback && !ask) return null;
    return (
      <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border px-3 text-sm">
        <span className="text-muted-foreground">
          {feedback
            ? [
                feedback.effort ? t(`effort.${feedback.effort}`) : null,
                feedback.rir === null ? null : t("rirSummary", { rir: rirLabel(feedback.rir) }),
              ]
                .filter(Boolean)
                .join(" · ")
            : t("skipped")}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          {feedback ? t("edit") : t("rate")}
        </Button>
      </div>
    );
  }

  return (
    <section aria-label={t("title")} className="bg-secondary/60 grid gap-3 rounded-xl p-3">
      <p className="font-medium">{t("title")}</p>
      <div role="radiogroup" aria-label={t("effortLabel")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {EFFORT_LEVELS.map((level) => (
          <Chip
            key={level}
            role="radio"
            selected={current.effort === level}
            onToggle={() => update({ effort: current.effort === level ? null : level })}
          >
            {t(`effort.${level}`)}
          </Chip>
        ))}
      </div>
      <div className="grid gap-1">
        <p id={rirLabelId} className="text-muted-foreground text-sm">
          {t("rirLabel")}
        </p>
        <div role="radiogroup" aria-labelledby={rirLabelId} className="flex flex-wrap gap-2">
          {RIR_OPTIONS.map((rir) => (
            <Chip
              key={rir}
              role="radio"
              selected={current.rir === rir}
              onToggle={() => update({ rir: current.rir === rir ? null : rir })}
              className="min-w-11 px-3"
            >
              {rirLabel(rir)}
            </Chip>
          ))}
        </div>
      </div>
      <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setOpen(false)}>
        {feedback ? t("close") : t("skip")}
      </Button>
    </section>
  );
}

function rirLabel(rir: number): string {
  return rir >= MAX_FEEDBACK_RIR ? `${MAX_FEEDBACK_RIR}+` : String(rir);
}
