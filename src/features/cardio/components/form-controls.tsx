"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import { Label } from "@/components/ui/label";
import { HEART_RATE_ZONES, type HeartRateZone } from "@/domain/cardio/types";
import type { HeartRateZoneRange } from "@/domain/cardio/zones";
import type { IntervalFieldValues } from "../form-values";

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}

/** Auswahlfeld im Stil der Eingabefelder: 44 px hoch, 16 px Schrift. */
export function SelectField({ id, label, value, onChange, children }: SelectFieldProps) {
  return (
    <div className="grid min-w-0 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background h-11 w-full min-w-0 rounded-md border px-3 text-base"
      >
        {children}
      </select>
    </div>
  );
}

interface ZoneSelectProps {
  id: string;
  label: string;
  emptyLabel: string;
  value: HeartRateZone | null;
  onChange: (zone: HeartRateZone | null) => void;
  /** Bereiche des Nutzers; ohne Profil erscheinen nur die Namen der Zonen. */
  zones: HeartRateZoneRange[] | null;
}

export function ZoneSelect({ id, label, emptyLabel, value, onChange, zones }: ZoneSelectProps) {
  const t = useTranslations("cardio");
  return (
    <SelectField
      id={id}
      label={label}
      value={value === null ? "" : String(value)}
      onChange={(next) => onChange(HEART_RATE_ZONES.find((zone) => String(zone) === next) ?? null)}
    >
      <option value="">{emptyLabel}</option>
      {HEART_RATE_ZONES.map((zone) => {
        const range = zones?.find((item) => item.zone === zone);
        const parts = [t("values.zone", { zone }), t(`zoneNames.${zone}`)];
        if (range) parts.push(t("values.bpmRange", { min: range.minBpm, max: range.maxBpm }));
        return (
          <option key={zone} value={zone}>
            {parts.join(" · ")}
          </option>
        );
      })}
    </SelectField>
  );
}

interface IntervalFieldsProps {
  idPrefix: string;
  value: IntervalFieldValues;
  onChange: (value: IntervalFieldValues) => void;
}

/** Schalter für Intervalle mit Belastung, Pause und Durchgängen. */
export function IntervalFields({ idPrefix, value, onChange }: IntervalFieldsProps) {
  const t = useTranslations("cardio.intervals");
  return (
    <div className="grid gap-3">
      <Chip selected={value.enabled} onToggle={() => onChange({ ...value, enabled: !value.enabled })} className="w-fit">
        {t("toggle")}
      </Chip>
      {value.enabled ? (
        <div className="grid grid-cols-3 items-end gap-2">
          <Field
            id={`${idPrefix}-work`}
            label={t("work")}
            inputMode="numeric"
            value={value.work}
            onChange={(event) => onChange({ ...value, work: event.target.value })}
          />
          <Field
            id={`${idPrefix}-rest`}
            label={t("rest")}
            inputMode="numeric"
            value={value.rest}
            onChange={(event) => onChange({ ...value, rest: event.target.value })}
          />
          <Field
            id={`${idPrefix}-repeats`}
            label={t("repeats")}
            inputMode="numeric"
            value={value.repeats}
            onChange={(event) => onChange({ ...value, repeats: event.target.value })}
          />
        </div>
      ) : null}
    </div>
  );
}
