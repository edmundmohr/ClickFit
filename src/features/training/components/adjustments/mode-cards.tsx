"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PlusIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ChoiceCard } from "@/components/forms/choice";
import { ACTIVITY_TYPES, type ActivityType } from "@/domain/cardio/types";
import { VACATION_TYPES, type Vacation, type VacationType } from "@/domain/training/vacation";
import { useActionRunner } from "@/hooks/use-action-runner";
import { isValidLocalDate, type LocalDate } from "@/lib/dates";
import { formatDayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { saveExtraSportsAction, saveModesAction, saveVacationAction } from "../../flex-actions";
import type { ExtraSport } from "../../services/settings-service";

const fieldClass = "border-input bg-background h-11 w-full min-w-0 rounded-md border px-3 text-base";

interface VacationCardProps {
  vacation: Vacation | null;
  gyms: { id: string; name: string }[];
  today: LocalDate;
}

/** Urlaubsmodus: Pause oder Training an einem anderen Ort für einen Zeitraum. */
export function VacationCard({ vacation, gyms, today }: VacationCardProps) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const [type, setType] = useState<VacationType>(vacation?.type ?? "pause");
  const [from, setFrom] = useState(vacation?.from ?? today);
  const [until, setUntil] = useState(vacation?.until ?? "");
  const [gymId, setGymId] = useState(vacation?.gymProfileId ?? "");

  function save() {
    const valid =
      isValidLocalDate(from) && isValidLocalDate(until) && from <= until && (type === "pause" || gymId !== "");
    if (!valid) {
      toast.error(t("adjustments.vacation.invalid"));
      return;
    }
    run(
      () => saveVacationAction({ type, from, until, gymProfileId: type === "travel" ? gymId : null }),
      () => toast.success(t("adjustments.saved")),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adjustments.vacation.title")}</CardTitle>
        <CardDescription>{t("adjustments.vacation.text")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {vacation ? (
          <p className="bg-secondary rounded-md px-3 py-2 text-sm font-medium">
            {t("adjustments.vacation.current", {
              type: t(`adjustments.vacation.types.${vacation.type}`),
              from: formatDayShort(vacation.from),
              until: formatDayShort(vacation.until),
            })}
          </p>
        ) : null}
        <div role="radiogroup" className="grid gap-2">
          {VACATION_TYPES.map((item) => (
            <ChoiceCard
              key={item}
              selected={type === item}
              onSelect={() => setType(item)}
              title={t(`adjustments.vacation.types.${item}`)}
              hint={t(`adjustments.vacation.typeHints.${item}`)}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="vacation-from">{t("adjustments.vacation.from")}</Label>
            <input
              id="vacation-from"
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className={fieldClass}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="vacation-until">{t("adjustments.vacation.until")}</Label>
            <input
              id="vacation-until"
              type="date"
              min={from}
              value={until}
              onChange={(event) => setUntil(event.target.value)}
              className={fieldClass}
            />
          </div>
        </div>
        {type === "travel" ? (
          <div className="grid gap-2">
            <Label htmlFor="vacation-gym">{t("adjustments.vacation.gym")}</Label>
            <select id="vacation-gym" value={gymId} onChange={(event) => setGymId(event.target.value)} className={fieldClass}>
              <option value="">{t("adjustments.vacation.noGym")}</option>
              {gyms.map((gym) => (
                <option key={gym.id} value={gym.id}>
                  {gym.name}
                </option>
              ))}
            </select>
            <Button asChild variant="link" className="h-11 justify-self-start px-0">
              <Link href="/training/gyms/new">{t("adjustments.vacation.newGym")}</Link>
            </Button>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button disabled={pending} onClick={save}>
            {t("adjustments.vacation.save")}
          </Button>
          {vacation ? (
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() => run(() => saveVacationAction(null), () => toast.success(t("adjustments.vacation.ended")))}
            >
              {t("adjustments.vacation.end")}
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

interface SwitchRowProps {
  title: string;
  text: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}

function SwitchRow({ title, text, checked, disabled, onChange }: SwitchRowProps) {
  const t = useTranslations("adjustments.modes");
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="hover:bg-accent/60 flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left"
    >
      <span className="flex-1">
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground block text-sm">{text}</span>
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-3 py-1 text-sm font-semibold",
          checked ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
        )}
      >
        {t(checked ? "on" : "off")}
      </span>
    </button>
  );
}

/** Schalter für den erholungsorientierten Modus und das Griffkraft-Modul. */
export function ModesCard({ recoveryMode, gripModule }: { recoveryMode: boolean; gripModule: boolean }) {
  const t = useTranslations("adjustments");
  const { run, pending } = useActionRunner();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("modes.title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <SwitchRow
          title={t("modes.recoveryTitle")}
          text={t("modes.recoveryText")}
          checked={recoveryMode}
          disabled={pending}
          onChange={(checked) => run(() => saveModesAction({ recoveryMode: checked }), () => toast.success(t("saved")))}
        />
        <SwitchRow
          title={t("modes.gripTitle")}
          text={t("modes.gripText")}
          checked={gripModule}
          disabled={pending}
          onChange={(checked) => run(() => saveModesAction({ gripModule: checked }), () => toast.success(t("saved")))}
        />
      </CardContent>
    </Card>
  );
}

const MAX_SPORTS = 6;
const SESSION_OPTIONS = [1, 2, 3, 4, 5, 6, 7];

/** Regelmäßiger Zusatzsport: beeinflusst die Plan-Erstellung. */
export function ExtraSportsCard({ sports }: { sports: ExtraSport[] }) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const [rows, setRows] = useState(sports);
  const free = ACTIVITY_TYPES.filter((type) => !rows.some((row) => row.type === type));
  const nameOf = (type: ActivityType) => t(`cardio.types.${type}`);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("adjustments.sports.title")}</CardTitle>
        <CardDescription>{t("adjustments.sports.text")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {rows.length === 0 ? <p className="text-muted-foreground text-sm">{t("adjustments.sports.empty")}</p> : null}
        {rows.map((row, index) => (
          <div key={row.type} className="grid grid-cols-[1fr_5.5rem_2.75rem] items-center gap-2">
            <span className="truncate font-medium">{nameOf(row.type)}</span>
            <select
              aria-label={t("adjustments.sports.perWeekLabel", { name: nameOf(row.type) })}
              value={row.sessionsPerWeek}
              onChange={(event) =>
                setRows((current) =>
                  current.map((item, position) =>
                    position === index ? { ...item, sessionsPerWeek: Number(event.target.value) } : item,
                  ),
                )
              }
              className={fieldClass}
            >
              {SESSION_OPTIONS.map((count) => (
                <option key={count} value={count}>
                  {`${count}× ${t("adjustments.sports.perWeek")}`}
                </option>
              ))}
            </select>
            <Button
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={t("adjustments.sports.remove", { name: nameOf(row.type) })}
              onClick={() => setRows((current) => current.filter((_, position) => position !== index))}
            >
              <XIcon aria-hidden />
            </Button>
          </div>
        ))}
        {rows.length < MAX_SPORTS && free.length > 0 ? (
          <div className="relative">
            <PlusIcon className="text-muted-foreground pointer-events-none absolute top-3.5 left-3 size-4" aria-hidden />
            <select
              aria-label={t("adjustments.sports.add")}
              value=""
              onChange={(event) => {
                const type = ACTIVITY_TYPES.find((item) => item === event.target.value);
                if (type) setRows((current) => [...current, { type, sessionsPerWeek: 1 }]);
              }}
              className={cn(fieldClass, "pl-9")}
            >
              <option value="">{t("adjustments.sports.add")}</option>
              {free.map((type) => (
                <option key={type} value={type}>
                  {nameOf(type)}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() => run(() => saveExtraSportsAction(rows), () => toast.success(t("adjustments.saved")))}
          >
            {t("adjustments.sports.save")}
          </Button>
          <Button asChild variant="outline">
            <Link href="/training/cardio">{t("adjustments.sports.toCardio")}</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
