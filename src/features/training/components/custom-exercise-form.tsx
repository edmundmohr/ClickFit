"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Chip, FieldGroup } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import {
  EQUIPMENT,
  EXERCISE_TYPES,
  MECHANICS,
  MOVEMENT_PATTERNS,
  MUSCLES,
  type Equipment,
  type ExerciseType,
  type Mechanic,
  type MovementPattern,
  type Muscle,
} from "@/domain/exercises/types";
import { useActionRunner } from "@/hooks/use-action-runner";
import { saveCustomExerciseAction } from "../flex-actions";
import type { CustomExerciseInput } from "../schemas";

const selectClass = "border-input bg-background h-11 w-full min-w-0 rounded-md border px-3 text-base";
const MAX_PRIMARY = 4;
/** Cardio wird unter „Cardio“ geloggt, nicht als Kraftübung. */
const PATTERNS = MOVEMENT_PATTERNS.filter((pattern) => pattern !== "cardio");
const TYPES = EXERCISE_TYPES.filter((type) => type !== "distance_duration");

function toggle<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

interface CustomExerciseFormProps {
  exerciseId: string | null;
  initial: CustomExerciseInput | null;
}

export function CustomExerciseForm({ exerciseId, initial }: CustomExerciseFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<ExerciseType>(initial?.type ?? "weight_reps");
  const [mechanic, setMechanic] = useState<Mechanic>(initial?.mechanic ?? "isolation");
  const [pattern, setPattern] = useState<MovementPattern>(initial?.pattern ?? "elbow_flexion");
  const [primary, setPrimary] = useState<Muscle[]>(initial?.primary ?? []);
  const [secondary, setSecondary] = useState<Muscle[]>(initial?.secondary ?? []);
  const [equipment, setEquipment] = useState<Equipment[]>(initial?.equipment ?? []);
  const [note, setNote] = useState(initial?.note ?? "");

  function submit() {
    if (name.trim().length < 2) {
      toast.error(t("training.customExercise.needsName"));
      return;
    }
    if (primary.length === 0) {
      toast.error(t("training.customExercise.needsMuscle"));
      return;
    }
    const input: CustomExerciseInput = {
      name: name.trim(),
      type,
      mechanic,
      pattern,
      primary,
      secondary: secondary.filter((muscle) => !primary.includes(muscle)),
      equipment,
      note: note.trim(),
    };
    run(
      () => saveCustomExerciseAction(exerciseId, input),
      (id) => {
        toast.success(t("training.customExercise.saved"));
        router.push(`/training/exercises/${id}`);
      },
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-5">
          <Field
            id="exercise-name"
            label={t("training.customExercise.name")}
            maxLength={60}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="grid gap-2">
            <Label htmlFor="exercise-type">{t("training.customExercise.type")}</Label>
            <select
              id="exercise-type"
              value={type}
              onChange={(event) => setType(TYPES.find((item) => item === event.target.value) ?? "weight_reps")}
              className={selectClass}
            >
              {TYPES.map((item) => (
                <option key={item} value={item}>
                  {t(`training.exerciseTypes.${item}`)}
                </option>
              ))}
            </select>
          </div>
          <FieldGroup label={t("training.customExercise.mechanic")}>
            <div role="radiogroup" className="flex flex-wrap gap-2">
              {MECHANICS.map((item) => (
                <Chip key={item} role="radio" selected={mechanic === item} onToggle={() => setMechanic(item)}>
                  {t(`training.mechanics.${item}`)}
                </Chip>
              ))}
            </div>
          </FieldGroup>
          <div className="grid gap-2">
            <Label htmlFor="exercise-pattern">{t("training.customExercise.pattern")}</Label>
            <select
              id="exercise-pattern"
              aria-describedby="exercise-pattern-hint"
              value={pattern}
              onChange={(event) => setPattern(PATTERNS.find((item) => item === event.target.value) ?? "elbow_flexion")}
              className={selectClass}
            >
              {PATTERNS.map((item) => (
                <option key={item} value={item}>
                  {t(`training.patterns.${item}`)}
                </option>
              ))}
            </select>
            <p id="exercise-pattern-hint" className="text-muted-foreground text-xs">
              {t("training.customExercise.patternHint")}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-5">
          <FieldGroup label={t("training.customExercise.primary")}>
            <div className="flex flex-wrap gap-2">
              {MUSCLES.map((muscle) => (
                <Chip
                  key={muscle}
                  selected={primary.includes(muscle)}
                  onToggle={() =>
                    setPrimary((current) =>
                      current.includes(muscle) || current.length < MAX_PRIMARY ? toggle(current, muscle) : current,
                    )
                  }
                >
                  {t(`muscles.${muscle}`)}
                </Chip>
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label={t("training.customExercise.secondary")}>
            <div className="flex flex-wrap gap-2">
              {MUSCLES.filter((muscle) => !primary.includes(muscle)).map((muscle) => (
                <Chip
                  key={muscle}
                  selected={secondary.includes(muscle)}
                  onToggle={() => setSecondary((current) => toggle(current, muscle))}
                >
                  {t(`muscles.${muscle}`)}
                </Chip>
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label={t("training.customExercise.equipment")} hint={t("training.customExercise.equipmentHint")}>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map((item) => (
                <Chip
                  key={item}
                  selected={equipment.includes(item)}
                  onToggle={() => setEquipment((current) => toggle(current, item))}
                >
                  {t(`equipment.${item}`)}
                </Chip>
              ))}
            </div>
          </FieldGroup>
          <div className="grid gap-2">
            <Label htmlFor="exercise-note">{t("training.customExercise.note")}</Label>
            <textarea
              id="exercise-note"
              rows={4}
              maxLength={600}
              placeholder={t("training.customExercise.notePlaceholder")}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-base"
            />
          </div>
        </CardContent>
      </Card>

      <Button size="lg" onClick={submit} disabled={pending}>
        {t("training.customExercise.save")}
      </Button>
    </div>
  );
}
