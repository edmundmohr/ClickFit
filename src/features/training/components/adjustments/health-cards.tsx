"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import { MAX_CYCLE_LENGTH, MIN_CYCLE_LENGTH } from "@/domain/training/cycle";
import { BODY_REGIONS, type BodyRegion } from "@/domain/training/types";
import { useActionRunner } from "@/hooks/use-action-runner";
import { isValidLocalDate, type LocalDate } from "@/lib/dates";
import { saveCycleAction, saveInjuriesAction, setExerciseExcludedAction } from "../../flex-actions";
import type { CycleSettings } from "../../services/settings-service";

const dateClass = "border-input bg-background h-11 w-full min-w-0 rounded-md border px-3 text-base";

/** Verletztenmodus: Beschwerden wählen, ohne den Fragebogen zu wiederholen. */
export function InjuryCard({ injuries, note }: { injuries: BodyRegion[]; note: string }) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const [selected, setSelected] = useState(injuries);
  const [text, setText] = useState(note);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adjustments.injury.title")}</CardTitle>
        <CardDescription>{t("adjustments.injury.text")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {BODY_REGIONS.map((region) => (
            <Chip
              key={region}
              selected={selected.includes(region)}
              onToggle={() =>
                setSelected((current) =>
                  current.includes(region) ? current.filter((item) => item !== region) : [...current, region],
                )
              }
            >
              {t(`onboarding.regions.${region}`)}
            </Chip>
          ))}
        </div>
        <Field
          id="injury-note"
          label={t("adjustments.injury.note")}
          placeholder={t("adjustments.injury.notePlaceholder")}
          maxLength={500}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <p className="text-muted-foreground text-xs">{t("adjustments.injury.disclaimer")}</p>
        <Button
          className="justify-self-start"
          disabled={pending}
          onClick={() =>
            run(
              () => saveInjuriesAction({ injuries: selected, injuryNote: text }),
              () => toast.success(t("adjustments.saved")),
            )
          }
        >
          {t("adjustments.injury.save")}
        </Button>
      </CardContent>
    </Card>
  );
}

/** Ausgeschlossene Übungen mit der Möglichkeit, sie wieder zuzulassen. */
export function ExcludedCard({ exercises }: { exercises: { id: string; name: string }[] }) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adjustments.excluded.title")}</CardTitle>
        <CardDescription>{t("adjustments.excluded.text")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {exercises.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("adjustments.excluded.empty")}</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {exercises.map((exercise) => (
              <li key={exercise.id} className="flex items-center gap-2 pl-3">
                <span className="min-w-0 flex-1 truncate">{exercise.name}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  disabled={pending}
                  aria-label={t("adjustments.excluded.include", { name: exercise.name })}
                  onClick={() =>
                    run(
                      () => setExerciseExcludedAction(exercise.id, false),
                      () => toast.success(t("training.library.includeDone")),
                    )
                  }
                >
                  <XIcon aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" className="justify-self-start">
          <Link href="/training/exercises">{t("adjustments.excluded.toLibrary")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

const DEFAULT_CYCLE_LENGTH = 28;

/** Zyklusangepasstes Training: rein freiwillig, lässt sich jederzeit samt Angaben abschalten. */
export function CycleCard({ cycle, today }: { cycle: CycleSettings | null; today: LocalDate }) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const [enabled, setEnabled] = useState(cycle?.enabled ?? false);
  const [lastStart, setLastStart] = useState(cycle?.lastStart ?? "");
  const [length, setLength] = useState(String(cycle?.lengthDays ?? DEFAULT_CYCLE_LENGTH));

  function save() {
    const lengthDays = Number(length);
    const valid =
      isValidLocalDate(lastStart) &&
      lastStart <= today &&
      Number.isInteger(lengthDays) &&
      lengthDays >= MIN_CYCLE_LENGTH &&
      lengthDays <= MAX_CYCLE_LENGTH;
    if (!valid) {
      toast.error(t("adjustments.cycle.invalid"));
      return;
    }
    run(
      () => saveCycleAction({ enabled: true, lastStart, lengthDays }),
      () => toast.success(t("adjustments.saved")),
    );
  }

  function disable() {
    setEnabled(false);
    setLastStart("");
    if (cycle) run(() => saveCycleAction(null), () => toast.success(t("adjustments.cycle.disabled")));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adjustments.cycle.title")}</CardTitle>
        <CardDescription>{t("adjustments.cycle.text")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Chip
          selected={enabled}
          onToggle={() => (enabled ? disable() : setEnabled(true))}
          className="justify-self-start"
        >
          {t("adjustments.cycle.enable")}
        </Chip>
        {enabled ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="cycle-start">{t("adjustments.cycle.lastStart")}</Label>
              <input
                id="cycle-start"
                type="date"
                max={today}
                value={lastStart}
                onChange={(event) => setLastStart(event.target.value)}
                className={dateClass}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cycle-length">{t("adjustments.cycle.length")}</Label>
              <Input
                id="cycle-length"
                inputMode="numeric"
                value={length}
                onChange={(event) => setLength(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={save}>
                {t("adjustments.cycle.save")}
              </Button>
              {cycle ? (
                <Button variant="ghost" className="text-destructive" disabled={pending} onClick={disable}>
                  {t("adjustments.cycle.disable")}
                </Button>
              ) : null}
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
