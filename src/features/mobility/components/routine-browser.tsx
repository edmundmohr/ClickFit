"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRightIcon, ClockIcon } from "lucide-react";
import { Chip } from "@/components/forms/choice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { filterRoutines } from "@/domain/mobility/routines";
import {
  MOBILITY_COMPLAINTS,
  MOBILITY_REGIONS,
  type MobilityComplaint,
  type MobilityRegion,
  type MobilityRoutineSummary,
} from "@/domain/mobility/types";
import type { LocalDate } from "@/lib/dates";
import { formatDayShort } from "@/lib/format";

export interface RoutineListItem extends MobilityRoutineSummary {
  /** Datum, an dem die Routine zuletzt gemacht wurde; `null` = noch nie. */
  lastDone: LocalDate | null;
}

interface RoutineBrowserProps {
  routines: RoutineListItem[];
  today: LocalDate;
  initialRegion: MobilityRegion | null;
  initialComplaint: MobilityComplaint | null;
}

/** Hält die Auswahl in der Adresse fest, damit sie beim Zurückkommen erhalten bleibt. */
function rememberFilter(region: MobilityRegion | null, complaint: MobilityComplaint | null): void {
  const params = new URLSearchParams();
  if (region) params.set("region", region);
  if (complaint) params.set("complaint", complaint);
  const query = params.toString();
  window.history.replaceState(null, "", query ? `?${query}` : window.location.pathname);
}

/** Eine Zeile Chips, die sich seitlich wischen lässt, statt den Bildschirm zu füllen. */
function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2">
      <h2 className="text-sm font-medium">{label}</h2>
      <div
        role="radiogroup"
        aria-label={label}
        className="flex [scrollbar-width:none] gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </div>
  );
}

const CHIP_CLASS = "shrink-0 whitespace-nowrap";

/** Filter nach Körperregion und Beschwerde samt Liste der passenden Routinen. */
export function RoutineBrowser({ routines, today, initialRegion, initialComplaint }: RoutineBrowserProps) {
  const t = useTranslations("mobility");
  const [region, setRegion] = useState<MobilityRegion | null>(initialRegion);
  const [complaint, setComplaint] = useState<MobilityComplaint | null>(initialComplaint);

  const matching = useMemo(() => filterRoutines(routines, { region, complaint }), [routines, region, complaint]);

  const selectRegion = (value: MobilityRegion | null) => {
    setRegion(value);
    rememberFilter(value, complaint);
  };
  const selectComplaint = (value: MobilityComplaint | null) => {
    setComplaint(value);
    rememberFilter(region, value);
  };
  const reset = () => {
    setRegion(null);
    setComplaint(null);
    rememberFilter(null, null);
  };

  const lastDoneText = (lastDone: LocalDate | null) => {
    if (lastDone === null) return t("routine.neverDone");
    return lastDone === today ? t("routine.doneToday") : t("routine.lastDone", { date: formatDayShort(lastDone) });
  };

  return (
    <div className="grid grid-cols-1 gap-4">
      <ChipRow label={t("filter.region")}>
        <Chip role="radio" selected={region === null} onToggle={() => selectRegion(null)} className={CHIP_CLASS}>
          {t("filter.all")}
        </Chip>
        {MOBILITY_REGIONS.map((item) => (
          <Chip
            key={item}
            role="radio"
            selected={region === item}
            onToggle={() => selectRegion(region === item ? null : item)}
            className={CHIP_CLASS}
          >
            {t(`regions.${item}`)}
          </Chip>
        ))}
      </ChipRow>
      <ChipRow label={t("filter.complaint")}>
        <Chip role="radio" selected={complaint === null} onToggle={() => selectComplaint(null)} className={CHIP_CLASS}>
          {t("filter.all")}
        </Chip>
        {MOBILITY_COMPLAINTS.map((item) => (
          <Chip
            key={item}
            role="radio"
            selected={complaint === item}
            onToggle={() => selectComplaint(complaint === item ? null : item)}
            className={CHIP_CLASS}
          >
            {t(`complaints.${item}`)}
          </Chip>
        ))}
      </ChipRow>

      <p className="text-muted-foreground text-sm" aria-live="polite">
        {matching.length > 0 ? t("filter.results", { count: matching.length }) : t("filter.empty")}
      </p>
      {matching.length === 0 ? (
        <Button variant="outline" onClick={reset}>
          {t("filter.reset")}
        </Button>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {matching.map((routine) => (
            <li key={routine.id}>
              <Link
                href={`/training/mobility/${routine.id}`}
                className="bg-card hover:bg-accent/60 flex min-h-11 items-center gap-3 rounded-xl border p-4 shadow-sm transition-colors"
              >
                <span className="grid min-w-0 flex-1 gap-2">
                  <span className="font-semibold">{routine.name}</span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <ClockIcon className="size-4" aria-hidden />
                      {t("routine.minutes", { minutes: Math.round(routine.durationSeconds / 60) })}
                    </span>
                    <span aria-hidden>{"·"}</span>
                    <span>{t(`levels.${routine.level}`)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {routine.regions.map((item) => (
                      <Badge key={item} variant={item === region ? "default" : "secondary"}>
                        {t(`regions.${item}`)}
                      </Badge>
                    ))}
                  </span>
                  <span className="text-muted-foreground text-xs">{lastDoneText(routine.lastDone)}</span>
                </span>
                <ChevronRightIcon className="text-muted-foreground size-5 shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
