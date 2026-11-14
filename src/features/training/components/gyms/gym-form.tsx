"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Chip, ChoiceCard, FieldGroup } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import { EQUIPMENT, type Equipment } from "@/domain/exercises/types";
import { LOCATION_TYPES, type LocationType } from "@/domain/training/types";
import {
  DEFAULT_BAR_WEIGHT,
  DEFAULT_PLATES,
  WEIGHT_UNITS,
  parseWeightList,
  type WeightUnit,
} from "@/domain/training/weights";
import { useActionRunner } from "@/hooks/use-action-runner";
import { parseDecimal } from "@/lib/units";
import { saveGymAction } from "../../flex-actions";
import type { GymInput } from "../../schemas";
import type { GymView } from "../../services/gym-service";
import { toInputText } from "../workout/workout-state";

/** Geräte, bei denen Gewichtsstufen sinnvoll sind. */
const WEIGHTED_EQUIPMENT: Equipment[] = ["barbell", "ez_bar", "dumbbell", "kettlebell", "machine", "cable", "smith_machine"];

interface PlateRow {
  weight: string;
  pairs: string;
}

interface RuleRow {
  equipment: Equipment;
  unit: WeightUnit;
  increment: string;
  values: string;
}

interface GymFormProps {
  gym: GymView | null;
  /** Einheit aus den Einstellungen des Nutzers. */
  defaultUnit: WeightUnit;
  defaultEquipment: Record<LocationType, Equipment[]>;
}

const selectClass = "border-input bg-background h-11 w-full min-w-0 rounded-md border px-3 text-base";

function toPlateRows(unit: WeightUnit, plates: GymView["plates"]): PlateRow[] {
  return (plates && plates.length > 0 ? plates : DEFAULT_PLATES[unit]).map((plate) => ({
    weight: toInputText(plate.weight),
    pairs: String(plate.pairs),
  }));
}

export function GymForm({ gym, defaultUnit, defaultEquipment }: GymFormProps) {
  const t = useTranslations();
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const hasOwnBar = !!gym && (gym.plateUnit !== null || gym.barWeight !== null || (gym.plates?.length ?? 0) > 0);

  const [name, setName] = useState(gym?.name ?? "");
  const [type, setType] = useState<LocationType>(gym?.type ?? "gym");
  const [equipment, setEquipment] = useState<Equipment[]>(gym?.equipment ?? defaultEquipment.gym);
  const [ownBar, setOwnBar] = useState(hasOwnBar);
  const [plateUnit, setPlateUnit] = useState<WeightUnit>(gym?.plateUnit ?? defaultUnit);
  const [barWeight, setBarWeight] = useState(toInputText(gym?.barWeight ?? DEFAULT_BAR_WEIGHT[gym?.plateUnit ?? defaultUnit]));
  const [plates, setPlates] = useState<PlateRow[]>(() => toPlateRows(gym?.plateUnit ?? defaultUnit, gym?.plates ?? null));
  const [rules, setRules] = useState<RuleRow[]>(() =>
    (gym?.weightRules ?? []).map((rule) => ({
      equipment: rule.equipment,
      unit: rule.unit,
      increment: toInputText(rule.increment),
      values: rule.values.map((value) => toInputText(value)).join(" "),
    })),
  );

  const freeRuleEquipment = WEIGHTED_EQUIPMENT.filter((item) => !rules.some((rule) => rule.equipment === item));
  const unitLabel = (unit: WeightUnit) => t(`training.units.${unit}`);

  function changeType(next: LocationType) {
    setType(next);
    // Beim Anlegen passt sich die Vorauswahl an; ein bestehender Ort behält sein Equipment.
    if (!gym) setEquipment(defaultEquipment[next]);
  }

  function changePlateUnit(unit: WeightUnit) {
    setPlateUnit(unit);
    setBarWeight(toInputText(DEFAULT_BAR_WEIGHT[unit]));
    setPlates(toPlateRows(unit, null));
  }

  function patchPlate(index: number, patch: Partial<PlateRow>) {
    setPlates((rows) => rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  function patchRule(index: number, patch: Partial<RuleRow>) {
    setRules((rows) => rows.map((row, position) => (position === index ? { ...row, ...patch } : row)));
  }

  function submit() {
    let bar: Pick<GymInput, "plateUnit" | "barWeight" | "plates"> = { plateUnit: null, barWeight: null, plates: null };
    if (ownBar) {
      const weight = parseDecimal(barWeight);
      const parsed = plates.map((row) => ({ weight: parseDecimal(row.weight), pairs: parseDecimal(row.pairs) }));
      const valid = parsed.flatMap((row) =>
        row.weight !== null && row.weight > 0 && row.pairs !== null && row.pairs >= 1
          ? [{ weight: row.weight, pairs: Math.round(row.pairs) }]
          : [],
      );
      if (weight === null || valid.length !== parsed.length || valid.length === 0) {
        toast.error(t("gyms.form.invalidPlates"));
        return;
      }
      bar = { plateUnit, barWeight: weight, plates: valid };
    }
    const input: GymInput = {
      name: name.trim(),
      type,
      equipment,
      ...bar,
      weightRules: rules.map((rule) => ({
        equipment: rule.equipment,
        unit: rule.unit,
        increment: parseDecimal(rule.increment) || null,
        values: parseWeightList(rule.values),
      })),
    };
    run(
      () => saveGymAction(gym?.id ?? null, input),
      () => {
        toast.success(t("gyms.form.saved"));
        router.push("/training/gyms");
      },
    );
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-5">
          <Field
            id="gym-name"
            label={t("gyms.form.name")}
            placeholder={t("gyms.form.namePlaceholder")}
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <FieldGroup label={t("gyms.form.type")}>
            <div role="radiogroup" className="grid gap-2">
              {LOCATION_TYPES.map((item) => (
                <ChoiceCard
                  key={item}
                  selected={type === item}
                  onSelect={() => changeType(item)}
                  title={t(`training.locations.${item}`)}
                  hint={t(`training.locationHints.${item}`)}
                />
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label={t("gyms.form.equipment")} hint={t("gyms.form.equipmentHint")}>
            <div className="flex flex-wrap gap-2">
              {EQUIPMENT.map((item) => (
                <Chip
                  key={item}
                  selected={equipment.includes(item)}
                  onToggle={() =>
                    setEquipment((current) =>
                      current.includes(item) ? current.filter((value) => value !== item) : [...current, item],
                    )
                  }
                >
                  {t(`equipment.${item}`)}
                </Chip>
              ))}
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setEquipment([...EQUIPMENT])}>
                {t("gyms.form.selectAll")}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setEquipment([])}>
                {t("gyms.form.selectNone")}
              </Button>
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("gyms.form.barTitle")}</CardTitle>
          <CardDescription>{t("gyms.form.barText")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Chip selected={!ownBar} onToggle={() => setOwnBar((value) => !value)} className="justify-self-start">
            {t("gyms.form.useDefaults")}
          </Chip>
          {ownBar ? (
            <>
              <FieldGroup label={t("gyms.form.plateUnit")}>
                <div role="radiogroup" className="flex gap-2">
                  {WEIGHT_UNITS.map((unit) => (
                    <Chip key={unit} role="radio" selected={plateUnit === unit} onToggle={() => changePlateUnit(unit)}>
                      {unitLabel(unit)}
                    </Chip>
                  ))}
                </div>
              </FieldGroup>
              <Field
                id="bar-weight"
                label={t("gyms.form.barWeight", { unit: unitLabel(plateUnit) })}
                inputMode="decimal"
                value={barWeight}
                onChange={(event) => setBarWeight(event.target.value)}
              />
              <FieldGroup label={t("gyms.form.plates")}>
                <div aria-hidden className="text-muted-foreground grid grid-cols-[1fr_1fr_2.75rem] gap-2 text-xs">
                  <span>{t("gyms.form.plateWeight", { unit: unitLabel(plateUnit) })}</span>
                  <span>{t("gyms.form.platePairs")}</span>
                </div>
                {plates.map((row, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_2.75rem] gap-2">
                    <Input
                      inputMode="decimal"
                      aria-label={t("gyms.form.plateWeightLabel", { number: index + 1 })}
                      value={row.weight}
                      onChange={(event) => patchPlate(index, { weight: event.target.value })}
                    />
                    <Input
                      inputMode="numeric"
                      aria-label={t("gyms.form.platePairsLabel", { number: index + 1 })}
                      value={row.pairs}
                      onChange={(event) => patchPlate(index, { pairs: event.target.value })}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={t("gyms.form.removePlate", { number: index + 1 })}
                      onClick={() => setPlates((rows) => rows.filter((_, position) => position !== index))}
                    >
                      <XIcon aria-hidden />
                    </Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setPlates((rows) => [...rows, { weight: "", pairs: "1" }])}
                  >
                    <PlusIcon aria-hidden />
                    {t("gyms.form.addPlate")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPlates(toPlateRows(plateUnit, null))}>
                    {t("gyms.form.loadDefaults")}
                  </Button>
                </div>
              </FieldGroup>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("gyms.form.rulesTitle")}</CardTitle>
          <CardDescription>{t("gyms.form.rulesText")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {rules.map((rule, index) => (
            <div key={rule.equipment} className="grid gap-3 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{t(`equipment.${rule.equipment}`)}</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={t("gyms.form.removeRule", { name: t(`equipment.${rule.equipment}`) })}
                  onClick={() => setRules((rows) => rows.filter((_, position) => position !== index))}
                >
                  <XIcon aria-hidden />
                </Button>
              </div>
              <div role="radiogroup" aria-label={t("gyms.form.ruleUnit")} className="flex gap-2">
                {WEIGHT_UNITS.map((unit) => (
                  <Chip key={unit} role="radio" selected={rule.unit === unit} onToggle={() => patchRule(index, { unit })}>
                    {unitLabel(unit)}
                  </Chip>
                ))}
              </div>
              <Field
                id={`rule-increment-${rule.equipment}`}
                label={t("gyms.form.ruleIncrement", { unit: unitLabel(rule.unit) })}
                hint={t("gyms.form.ruleIncrementHint")}
                inputMode="decimal"
                value={rule.increment}
                onChange={(event) => patchRule(index, { increment: event.target.value })}
              />
              <Field
                id={`rule-values-${rule.equipment}`}
                label={t("gyms.form.ruleValues", { unit: unitLabel(rule.unit) })}
                hint={t("gyms.form.ruleValuesHint")}
                inputMode="text"
                value={rule.values}
                onChange={(event) => patchRule(index, { values: event.target.value })}
              />
            </div>
          ))}
          {freeRuleEquipment.length > 0 ? (
            <select
              aria-label={t("gyms.form.addRule")}
              value=""
              onChange={(event) => {
                const item = WEIGHTED_EQUIPMENT.find((value) => value === event.target.value);
                if (item) setRules((rows) => [...rows, { equipment: item, unit: defaultUnit, increment: "", values: "" }]);
              }}
              className={selectClass}
            >
              <option value="">{t("gyms.form.addRule")}</option>
              {freeRuleEquipment.map((item) => (
                <option key={item} value={item}>
                  {t(`equipment.${item}`)}
                </option>
              ))}
            </select>
          ) : (
            <p className="text-muted-foreground text-sm">{t("gyms.form.noRuleEquipment")}</p>
          )}
        </CardContent>
      </Card>

      <Button size="lg" onClick={submit} disabled={pending}>
        {t("gyms.form.save")}
      </Button>
    </div>
  );
}
