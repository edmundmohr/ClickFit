"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Chip, FieldGroup } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CARDIO_ACTIVITY_TYPES,
  INTENSITIES,
  SPORT_ACTIVITY_TYPES,
  isActivityType,
  type ActivityType,
  type HeartRateZone,
  type Intensity,
} from "@/domain/cardio/types";
import { zoneForHeartRate, type HeartRateZoneRange } from "@/domain/cardio/zones";
import { useActionRunner } from "@/hooks/use-action-runner";
import { isValidLocalDate, type LocalDate } from "@/lib/dates";
import { logActivityAction } from "../actions";
import { readIntervals, readNumber, toIntervalFields, type ActivityDraft } from "../form-values";
import type { ActivityInput } from "../schemas";
import { IntervalFields, SelectField, ZoneSelect } from "./form-controls";

interface ActivityFormProps {
  draft: ActivityDraft;
  today: LocalDate;
  zones: HeartRateZoneRange[] | null;
  maxBpm: number | null;
  onClose: () => void;
}

const MAX_MINUTES = 1440;
const MAX_KM = 1000;

/** Formular „Einheit eintragen“ für Cardio und Zusatzsport, optional aus dem Wochenplan vorbefüllt. */
export function ActivityForm({ draft, today, zones, maxBpm, onClose }: ActivityFormProps) {
  const t = useTranslations("cardio");
  const { run, pending } = useActionRunner();
  const [type, setType] = useState<ActivityType>(draft.type);
  const [date, setDate] = useState(draft.date);
  const [minutesText, setMinutesText] = useState(draft.minutes === null ? "" : String(draft.minutes));
  const [distanceText, setDistanceText] = useState("");
  const [heartRateText, setHeartRateText] = useState("");
  const [zone, setZone] = useState<HeartRateZone | null>(draft.zone);
  const [intensity, setIntensity] = useState<Intensity>(draft.intensity);
  const [intervalFields, setIntervalFields] = useState(() => toIntervalFields(draft.intervals));
  const [note, setNote] = useState("");

  const minutes = readNumber(minutesText, { min: 1, max: MAX_MINUTES });
  const distanceKm = readNumber(distanceText, { min: 0.01, max: MAX_KM });
  const heartRate = readNumber(heartRateText, { min: 30, max: 250, whole: true });
  const intervals = readIntervals(intervalFields);
  const suggestedZone = typeof heartRate === "number" && maxBpm !== null ? zoneForHeartRate(heartRate, maxBpm) : null;

  function toInput(): ActivityInput | null {
    if (typeof minutes !== "number" || distanceKm === undefined || heartRate === undefined || intervals === undefined) {
      return null;
    }
    if (!isValidLocalDate(date) || date > today) return null;
    return {
      date,
      type,
      durationSeconds: Math.round(minutes * 60),
      distanceMeters: distanceKm === null ? null : Math.round(distanceKm * 1000),
      avgHeartRate: heartRate,
      zone: zone ?? suggestedZone,
      intensity,
      intervals,
      note: note.trim() || null,
    };
  }
  const input = toInput();

  function save() {
    if (!input) return;
    run(
      () => logActivityAction(input),
      () => {
        toast.success(t("form.saved"));
        onClose();
      },
    );
  }

  const optional = (label: string) => `${label} (${t("form.optional")})`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{t("form.title")}</DialogTitle>
          <DialogDescription>{t("form.text")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <SelectField
            id="activity-type"
            label={t("form.type")}
            value={type}
            onChange={(value) => setType(isActivityType(value) ? value : "other")}
          >
            <optgroup label={t("groups.cardio")}>
              {CARDIO_ACTIVITY_TYPES.map((item) => (
                <option key={item} value={item}>
                  {t(`types.${item}`)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("groups.sport")}>
              {SPORT_ACTIVITY_TYPES.map((item) => (
                <option key={item} value={item}>
                  {t(`types.${item}`)}
                </option>
              ))}
            </optgroup>
          </SelectField>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field
              id="activity-date"
              label={t("form.date")}
              type="date"
              max={today}
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
            <Field
              id="activity-minutes"
              label={t("form.minutes")}
              inputMode="decimal"
              required
              aria-invalid={minutes === undefined}
              value={minutesText}
              onChange={(event) => setMinutesText(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field
              id="activity-distance"
              label={t("form.distance")}
              inputMode="decimal"
              placeholder={t("form.optional")}
              aria-invalid={distanceKm === undefined}
              value={distanceText}
              onChange={(event) => setDistanceText(event.target.value)}
            />
            <Field
              id="activity-heart-rate"
              label={t("form.heartRate")}
              inputMode="numeric"
              placeholder={t("form.optional")}
              aria-invalid={heartRate === undefined}
              value={heartRateText}
              onChange={(event) => setHeartRateText(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <ZoneSelect
              id="activity-zone"
              label={optional(t("form.zone"))}
              emptyLabel={t("form.noZone")}
              value={zone}
              onChange={setZone}
              zones={zones}
            />
            {zone === null && suggestedZone !== null ? (
              <p className="text-muted-foreground text-xs" aria-live="polite">
                {t("form.zoneFromHeartRate", { zone: suggestedZone })}
              </p>
            ) : null}
          </div>
          <FieldGroup label={t("form.intensity")}>
            <div role="radiogroup" aria-label={t("form.intensity")} className="flex flex-wrap gap-2">
              {INTENSITIES.map((item) => (
                <Chip key={item} role="radio" selected={intensity === item} onToggle={() => setIntensity(item)}>
                  {t(`intensities.${item}`)}
                </Chip>
              ))}
            </div>
          </FieldGroup>
          <IntervalFields idPrefix="activity-interval" value={intervalFields} onChange={setIntervalFields} />
          <Field
            id="activity-note"
            label={optional(t("form.note"))}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <DialogFooter>
            <Button type="submit" size="lg" disabled={pending || input === null}>
              {t("form.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
