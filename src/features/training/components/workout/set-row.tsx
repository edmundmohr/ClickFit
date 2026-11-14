"use client";

import { useTranslations } from "next-intl";
import { CheckIcon, TrophyIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SetDraft } from "./workout-state";

const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];
const NO_RIR = "";

interface SetRowProps {
  set: SetDraft;
  /** Laufende Nummer unter den Arbeitssätzen. */
  number: number;
  showWeight: boolean;
  /** Zielbereich als Platzhalter im leeren Feld, z. B. „6–10“. */
  repsPlaceholder: string;
  isRecord: boolean;
  invalid: "weight" | "reps" | null;
  onEdit: (patch: Partial<SetDraft>) => void;
  onToggle: () => void;
  onOpenOptions: () => void;
}

const inputClass =
  "border-input bg-background h-11 w-full min-w-0 rounded-md border px-1 text-center text-base tabular-nums";

export function SetRow({
  set,
  number,
  showWeight,
  repsPlaceholder,
  isRecord,
  invalid,
  onEdit,
  onToggle,
  onOpenOptions,
}: SetRowProps) {
  const t = useTranslations("workout");
  const label = set.type === "work" ? String(number) : t(`setTypeShort.${set.type}`);

  return (
    <div
      className={cn(
        "grid items-center gap-1.5 rounded-lg p-1",
        showWeight ? "grid-cols-[2.75rem_1fr_1fr_3.5rem_2.75rem]" : "grid-cols-[2.75rem_1fr_3.5rem_2.75rem]",
        set.completed && "bg-primary/10",
      )}
    >
      <button
        type="button"
        onClick={onOpenOptions}
        aria-label={t("setOptions", { number })}
        className={cn(
          "relative flex size-11 items-center justify-center rounded-md border text-sm font-semibold",
          set.type === "warmup" && "text-muted-foreground border-dashed",
          (set.type === "failure" || set.type === "drop") && "border-primary text-primary",
        )}
      >
        {label}
        {isRecord ? (
          <TrophyIcon className="absolute -top-1 -right-1 size-4 text-amber-500" aria-label={t("record")} />
        ) : null}
        {set.note ? <span aria-hidden className="bg-primary absolute bottom-1 size-1.5 rounded-full" /> : null}
      </button>
      {showWeight ? (
        <input
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          aria-label={t("weightLabel", { number })}
          aria-invalid={invalid === "weight"}
          value={set.weightText}
          onChange={(event) => onEdit({ weightText: event.target.value })}
          onFocus={(event) => event.target.select()}
          className={cn(inputClass, invalid === "weight" && "border-destructive")}
        />
      ) : null}
      <input
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        aria-label={t("repsLabel", { number })}
        aria-invalid={invalid === "reps"}
        placeholder={repsPlaceholder}
        value={set.repsText}
        onChange={(event) => onEdit({ repsText: event.target.value })}
        onFocus={(event) => event.target.select()}
        className={cn(inputClass, invalid === "reps" && "border-destructive")}
      />
      <select
        aria-label={t("rirLabel", { number })}
        value={set.rir === null ? NO_RIR : String(set.rir)}
        onChange={(event) => onEdit({ rir: event.target.value === NO_RIR ? null : Number(event.target.value) })}
        className="border-input bg-background h-11 w-full rounded-md border px-1 text-center text-base"
      >
        <option value={NO_RIR}>{t("rirNone")}</option>
        {RIR_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={set.completed}
        aria-label={t(set.completed ? "uncomplete" : "complete", { number })}
        className={cn(
          "flex size-11 items-center justify-center rounded-md border transition-colors",
          set.completed ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
        )}
      >
        <CheckIcon className="size-5" aria-hidden />
      </button>
    </div>
  );
}
