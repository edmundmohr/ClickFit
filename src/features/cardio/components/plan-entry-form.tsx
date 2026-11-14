"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CARDIO_ACTIVITY_TYPES,
  isCardioActivityType,
  type CardioActivityType,
  type HeartRateZone,
} from "@/domain/cardio/types";
import type { HeartRateZoneRange } from "@/domain/cardio/zones";
import { WEEKDAYS, type Weekday } from "@/domain/training/types";
import { useActionRunner } from "@/hooks/use-action-runner";
import { saveCardioPlanEntryAction } from "../actions";
import { readIntervals, readNumber, toIntervalFields } from "../form-values";
import type { CardioPlanEntry } from "../services/cardio-plan-service";
import { IntervalFields, SelectField, ZoneSelect } from "./form-controls";

/** Neuer Eintrag für einen Wochentag oder ein bestehender Eintrag zum Ändern. */
export type PlanDraft = { weekday: Weekday; entry?: undefined } | { weekday?: undefined; entry: CardioPlanEntry };

interface PlanEntryFormProps {
  draft: PlanDraft;
  zones: HeartRateZoneRange[] | null;
  onClose: () => void;
}

const DEFAULT_MINUTES = 30;
const DEFAULT_ZONE: HeartRateZone = 2;

/** Dialog zum Anlegen oder Ändern einer geplanten Cardio-Einheit. */
export function PlanEntryForm({ draft, zones, onClose }: PlanEntryFormProps) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const entry = draft.entry;
  const [weekday, setWeekday] = useState<Weekday>(entry?.weekday ?? draft.weekday ?? 1);
  const [type, setType] = useState<CardioActivityType>(entry?.type ?? "running");
  const [minutesText, setMinutesText] = useState(String(entry?.minutes ?? DEFAULT_MINUTES));
  const [zone, setZone] = useState<HeartRateZone | null>(entry ? entry.zone : DEFAULT_ZONE);
  const [intervalFields, setIntervalFields] = useState(() => toIntervalFields(entry?.intervals ?? null));
  const [note, setNote] = useState(entry?.note ?? "");

  const minutes = readNumber(minutesText, { min: 1, max: 600, whole: true });
  const intervals = readIntervals(intervalFields);
  const valid = typeof minutes === "number" && intervals !== undefined;

  function save() {
    if (typeof minutes !== "number" || intervals === undefined) return;
    const input = { id: entry?.id, weekday, type, minutes, zone, intervals, note: note.trim() || null };
    run(
      () => saveCardioPlanEntryAction(input),
      () => {
        toast.success(t("cardio.planForm.saved"));
        onClose();
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{t(entry ? "cardio.planForm.editTitle" : "cardio.planForm.addTitle")}</DialogTitle>
          <DialogDescription>{t("cardio.planForm.text")}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <SelectField
            id="plan-weekday"
            label={t("cardio.planForm.weekday")}
            value={String(weekday)}
            onChange={(value) => setWeekday(WEEKDAYS.find((day) => String(day) === value) ?? 1)}
          >
            {WEEKDAYS.map((day) => (
              <option key={day} value={day}>
                {t(`training.weekdays.${day}`)}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 items-end gap-3">
            <SelectField
              id="plan-type"
              label={t("cardio.planForm.type")}
              value={type}
              onChange={(value) => setType(isCardioActivityType(value) ? value : "running")}
            >
              {CARDIO_ACTIVITY_TYPES.map((item) => (
                <option key={item} value={item}>
                  {t(`cardio.types.${item}`)}
                </option>
              ))}
            </SelectField>
            <Field
              id="plan-minutes"
              label={t("cardio.planForm.minutes")}
              inputMode="numeric"
              required
              aria-invalid={typeof minutes !== "number"}
              value={minutesText}
              onChange={(event) => setMinutesText(event.target.value)}
            />
          </div>
          <ZoneSelect
            id="plan-zone"
            label={t("cardio.planForm.zone")}
            emptyLabel={t("cardio.planForm.noZone")}
            value={zone}
            onChange={setZone}
            zones={zones}
          />
          <IntervalFields idPrefix="plan-interval" value={intervalFields} onChange={setIntervalFields} />
          <Field
            id="plan-note"
            label={t("cardio.planForm.note")}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <DialogFooter>
            <Button type="submit" size="lg" disabled={pending || !valid}>
              {t("cardio.planForm.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
