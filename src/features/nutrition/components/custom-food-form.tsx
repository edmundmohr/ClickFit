"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Chip, FieldGroup } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import { FormError } from "@/components/forms/form-error";
import { FOOD_BASES, type FoodBasis } from "@/domain/nutrition/types";
import type { ErrorCode } from "@/lib/errors";
import { parseDecimal } from "@/lib/units";
import { createCustomFoodAction } from "../actions";

interface CustomFoodFormProps {
  /** Seite, zu der es nach dem Speichern geht; die Kennung des neuen Lebensmittels wird angehängt. */
  returnTo: string;
  initialBarcode: string;
}

const NUMBER_FIELDS = ["kcal", "protein", "carbs", "fat"] as const;

export function CustomFoodForm({ returnTo, initialBarcode }: CustomFoodFormProps) {
  const t = useTranslations("nutrition");
  const router = useRouter();
  const [basis, setBasis] = useState<FoodBasis>("g");
  const [text, setText] = useState({ name: "", brand: "", servingLabel: "", barcode: initialBarcode });
  const [numbers, setNumbers] = useState({ kcal: "", protein: "", carbs: "", fat: "", servingSize: "" });
  const [error, setError] = useState<ErrorCode | null>(null);
  const [pending, startTransition] = useTransition();

  const parsed = {
    kcal: parseDecimal(numbers.kcal),
    proteinG: parseDecimal(numbers.protein) ?? 0,
    carbsG: parseDecimal(numbers.carbs) ?? 0,
    fatG: parseDecimal(numbers.fat) ?? 0,
    servingSize: parseDecimal(numbers.servingSize),
  };
  const valid = text.name.trim() !== "" && parsed.kcal !== null;

  function submit() {
    if (!valid || parsed.kcal === null) return;
    setError(null);
    const kcal = parsed.kcal;
    startTransition(async () => {
      const result = await createCustomFoodAction({
        ...text,
        basis,
        kcal,
        proteinG: parsed.proteinG,
        carbsG: parsed.carbsG,
        fatG: parsed.fatG,
        servingSize: parsed.servingSize && parsed.servingSize > 0 ? parsed.servingSize : null,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success(t("food.saved"));
      router.push(`${returnTo}${returnTo.includes("?") ? "&" : "?"}ref=${result.data}`);
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field id="food-name" label={t("food.name")} value={text.name} maxLength={120} required onChange={(event) => setText({ ...text, name: event.target.value })} />
      <Field id="food-brand" label={t("food.brand")} value={text.brand} maxLength={80} onChange={(event) => setText({ ...text, brand: event.target.value })} />
      <FieldGroup label={t("food.basis")}>
        <div role="radiogroup" className="flex flex-wrap gap-2">
          {FOOD_BASES.map((option) => (
            <Chip key={option} role="radio" selected={basis === option} onToggle={() => setBasis(option)}>
              {t(`food.bases.${option}`)}
            </Chip>
          ))}
        </div>
      </FieldGroup>
      <div className="grid grid-cols-2 gap-3">
        {NUMBER_FIELDS.map((field) => (
          <Field
            key={field}
            id={`food-${field}`}
            label={t(`food.${field}`)}
            inputMode="decimal"
            required={field === "kcal"}
            value={numbers[field]}
            onChange={(event) => setNumbers({ ...numbers, [field]: event.target.value })}
          />
        ))}
      </div>
      {basis === "serving" ? null : (
        <div className="grid grid-cols-2 gap-3">
          <Field
            id="food-serving-size"
            label={t("food.servingSize", { unit: t(`units.${basis}`) })}
            inputMode="decimal"
            value={numbers.servingSize}
            onChange={(event) => setNumbers({ ...numbers, servingSize: event.target.value })}
          />
          <Field
            id="food-serving-label"
            label={t("food.servingLabel")}
            placeholder={t("food.servingLabelPlaceholder")}
            value={text.servingLabel}
            maxLength={60}
            onChange={(event) => setText({ ...text, servingLabel: event.target.value })}
          />
        </div>
      )}
      <Field id="food-barcode" label={t("food.barcode")} inputMode="numeric" value={text.barcode} maxLength={32} onChange={(event) => setText({ ...text, barcode: event.target.value })} />
      <FormError code={error} />
      <Button type="submit" size="lg" disabled={pending || !valid}>
        {t("food.save")}
      </Button>
    </form>
  );
}
