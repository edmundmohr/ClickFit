"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, FieldGroup } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import type { Macros } from "@/domain/nutrition/types";
import { useActionRunner } from "@/hooks/use-action-runner";
import { parseDecimal } from "@/lib/units";
import {
  addSupplementAction,
  deleteSupplementAction,
  recalculateTargetAction,
  setManualTargetAction,
  setWaterGoalAction,
} from "../actions";
import { SUPPLEMENT_TIMINGS, type SupplementTiming } from "../schemas";

const TARGET_FIELDS = [
  { key: "kcal", label: "kcal" },
  { key: "proteinG", label: "protein" },
  { key: "carbsG", label: "carbs" },
  { key: "fatG", label: "fat" },
] as const;

/** Ziele von Hand festlegen oder aus dem Profil neu berechnen. */
export function TargetForm({ target, canRecalculate }: { target: Macros | null; canRecalculate: boolean }) {
  const t = useTranslations("nutrition");
  const { run, pending } = useActionRunner();
  const [values, setValues] = useState({
    kcal: target ? String(target.kcal) : "",
    proteinG: target ? String(target.proteinG) : "",
    carbsG: target ? String(target.carbsG) : "",
    fatG: target ? String(target.fatG) : "",
  });
  const parsed = {
    kcal: parseDecimal(values.kcal),
    proteinG: parseDecimal(values.proteinG),
    carbsG: parseDecimal(values.carbsG),
    fatG: parseDecimal(values.fatG),
  };
  const valid = Object.values(parsed).every((value) => value !== null);

  function save() {
    if (!valid) return;
    run(
      () =>
        setManualTargetAction({
          kcal: Math.round(parsed.kcal ?? 0),
          proteinG: Math.round(parsed.proteinG ?? 0),
          carbsG: Math.round(parsed.carbsG ?? 0),
          fatG: Math.round(parsed.fatG ?? 0),
        }),
      () => toast.success(t("targets.manualSaved")),
    );
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        {TARGET_FIELDS.map((field) => (
          <Field
            key={field.key}
            id={`target-${field.key}`}
            label={t(`food.${field.label}`)}
            inputMode="numeric"
            value={values[field.key]}
            onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !valid}>
          {t("targets.manualSave")}
        </Button>
        {canRecalculate ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => run(recalculateTargetAction, () => toast.success(t("targets.recalculated")))}
          >
            {t("targets.recalculate")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function WaterGoalForm({ goalMl, recommendedMl }: { goalMl: number; recommendedMl: number | null }) {
  const t = useTranslations("nutrition.targets");
  const { run, pending } = useActionRunner();
  const [value, setValue] = useState(String(goalMl));
  const parsed = parseDecimal(value);

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (parsed !== null) run(() => setWaterGoalAction(Math.round(parsed)), () => toast.success(t("waterSaved")));
      }}
    >
      <Field
        id="water-goal"
        label={t("waterGoal")}
        inputMode="numeric"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        hint={recommendedMl ? t("waterRecommended", { value: recommendedMl }) : undefined}
      />
      <Button type="submit" variant="outline" disabled={pending || parsed === null} className="justify-self-start">
        {t("waterSave")}
      </Button>
    </form>
  );
}

export function SupplementForm() {
  const t = useTranslations("nutrition.supplements");
  const { run, pending } = useActionRunner();
  const [name, setName] = useState("");
  const [dose, setDose] = useState("");
  const [timing, setTiming] = useState<SupplementTiming>("any");

  function add() {
    run(
      () => addSupplementAction({ name, dose, timing }),
      () => {
        toast.success(t("added"));
        setName("");
        setDose("");
      },
    );
  }

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim() !== "") add();
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field id="supplement-name" label={t("name")} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
        <Field id="supplement-dose" label={t("dose")} placeholder={t("dosePlaceholder")} value={dose} maxLength={60} onChange={(event) => setDose(event.target.value)} />
      </div>
      <FieldGroup label={t("timing")}>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {SUPPLEMENT_TIMINGS.map((option) => (
            <Chip key={option} role="radio" selected={timing === option} onToggle={() => setTiming(option)}>
              {t(`timings.${option}`)}
            </Chip>
          ))}
        </div>
      </FieldGroup>
      <Button type="submit" disabled={pending || name.trim() === ""} className="justify-self-start">
        {t("addTitle")}
      </Button>
    </form>
  );
}

export function DeleteSupplementButton({ supplementId, name }: { supplementId: string; name: string }) {
  const t = useTranslations("nutrition.supplements");
  const { run, pending } = useActionRunner();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("delete", { name })}
      disabled={pending}
      onClick={() => run(() => deleteSupplementAction(supplementId), () => toast.success(t("deleted")))}
    >
      <Trash2Icon aria-hidden />
    </Button>
  );
}
