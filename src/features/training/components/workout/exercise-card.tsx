"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CircleDotIcon, FlameIcon, InfoIcon, PlusIcon, StickyNoteIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { detectRecords } from "@/domain/training/records";
import type { ExerciseFeedback } from "@/domain/training/types";
import { formatClock, formatDayShort, formatNumber } from "@/lib/format";
import { toDisplayWeight, unitSystemOf } from "@/lib/units";
import { ExerciseCheckIn } from "./exercise-check-in";
import { SetRow } from "./set-row";
import {
  isExerciseDone,
  toLoggedSet,
  usesWeight,
  workSetNumber,
  type ExerciseDraft,
  type SetDraft,
} from "./workout-state";

export interface InvalidField {
  setId: string;
  field: "weight" | "reps";
}

interface ExerciseCardProps {
  exercise: ExerciseDraft;
  invalid: InvalidField | null;
  onEdit: (setId: string, patch: Partial<SetDraft>) => void;
  onToggle: (setId: string) => void;
  onOpenOptions: (setId: string) => void;
  onAddSet: () => void;
  onAddWarmup: () => void;
  onEditNote: () => void;
  /** Öffnet den Scheiben-Rechner; nur bei Übungen mit Scheiben vorhanden. */
  onOpenPlates?: () => void;
  /** Nach dem letzten Satz nach Anstrengung und RIR fragen. */
  checkIn: boolean;
  onFeedback: (feedback: ExerciseFeedback) => void;
}

export function ExerciseCard({
  exercise,
  invalid,
  onEdit,
  onToggle,
  onOpenOptions,
  onAddSet,
  onAddWarmup,
  onEditNote,
  onOpenPlates,
  checkIn,
  onFeedback,
}: ExerciseCardProps) {
  const t = useTranslations();
  const showWeight = usesWeight(exercise.type);
  const unitSystem = unitSystemOf(exercise.unit);
  const unit = t(`training.units.${exercise.unit}`);
  const isTimed = exercise.type === "duration";
  const done = isExerciseDone(exercise);

  const weightColumn =
    exercise.type === "weighted_bodyweight"
      ? t("workout.columns.extraWeight")
      : exercise.type === "assisted_bodyweight"
        ? t("workout.columns.assistance")
        : t("workout.columns.weight");

  const previousText = exercise.previous?.sets
    .map((set) => {
      const reps = set.reps ?? 0;
      if (!showWeight || set.weightKg === null) return String(reps);
      return `${formatNumber(toDisplayWeight(set.weightKg, unitSystem))} × ${reps}`;
    })
    .join(" · ");

  return (
    <Card id={`exercise-${exercise.id}`} className="scroll-mt-20">
      <CardHeader className="gap-1">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg leading-tight">{exercise.name}</CardTitle>
          <Link
            href={`/training/exercises/${exercise.exerciseId}`}
            aria-label={t("workout.details")}
            className="text-muted-foreground -mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center"
          >
            <InfoIcon className="size-5" aria-hidden />
          </Link>
        </div>
        <p className="text-muted-foreground text-sm">
          {t(isTimed ? "training.prescriptionSeconds" : "training.prescription", {
            sets: exercise.sets.filter((set) => set.type !== "warmup").length,
            repMin: exercise.repMin,
            repMax: exercise.repMax,
          })}
          {" · "}
          {t("workout.rirTarget", { rir: exercise.targetRir })}
          {" · "}
          {t("workout.rest", { time: formatClock(exercise.restSeconds) })}
        </p>
        <p className="text-sm">
          {exercise.previous && previousText
            ? `${t("workout.previous", { date: formatDayShort(exercise.previous.date) })}: ${previousText}`
            : t("workout.noPrevious")}
        </p>
        {exercise.note ? (
          <p className="bg-secondary rounded-md px-3 py-2 text-sm whitespace-pre-line">{exercise.note}</p>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-2">
        <div
          aria-hidden
          className={
            showWeight
              ? "text-muted-foreground grid grid-cols-[2.75rem_1fr_1fr_3.5rem_2.75rem] gap-1.5 px-1 text-center text-xs"
              : "text-muted-foreground grid grid-cols-[2.75rem_1fr_3.5rem_2.75rem] gap-1.5 px-1 text-center text-xs"
          }
        >
          <span>{t("workout.columns.set")}</span>
          {showWeight ? <span>{`${weightColumn} (${unit})`}</span> : null}
          <span>{isTimed ? t("workout.columns.seconds") : t("workout.columns.reps")}</span>
          <span>{t("workout.columns.rir")}</span>
          <span>{t("workout.columns.done")}</span>
        </div>
        {exercise.sets.map((set) => (
          <SetRow
            key={set.id}
            set={set}
            number={workSetNumber(exercise.sets, set.id)}
            showWeight={showWeight}
            repsPlaceholder={`${exercise.repMin}–${exercise.repMax}`}
            isRecord={detectRecords([toLoggedSet(exercise, set)], exercise.bests, exercise.type).length > 0}
            invalid={invalid?.setId === set.id ? invalid.field : null}
            onEdit={(patch) => onEdit(set.id, patch)}
            onToggle={() => onToggle(set.id)}
            onOpenOptions={() => onOpenOptions(set.id)}
          />
        ))}
        {done || exercise.feedback ? (
          <ExerciseCheckIn feedback={exercise.feedback} ask={checkIn && done} onChange={onFeedback} />
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onAddSet}>
            <PlusIcon aria-hidden />
            {t("workout.addSet")}
          </Button>
          {showWeight ? (
            <Button variant="outline" size="sm" onClick={onAddWarmup}>
              <FlameIcon aria-hidden />
              {t("workout.addWarmup")}
            </Button>
          ) : null}
          {onOpenPlates ? (
            <Button variant="outline" size="sm" onClick={onOpenPlates}>
              <CircleDotIcon aria-hidden />
              {t("workout.plates.open")}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={onEditNote}>
            <StickyNoteIcon aria-hidden />
            {t("workout.exerciseNote")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
