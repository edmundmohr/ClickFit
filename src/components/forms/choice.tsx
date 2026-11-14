"use client";

import type { ReactNode } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChoiceCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  /** `radio` für Einzelauswahl, `checkbox` für Mehrfachauswahl. */
  role?: "radio" | "checkbox";
}

/** Große Auswahlkarte für Fragebögen: gut mit dem Daumen zu treffen. */
export function ChoiceCard({ selected, onSelect, title, hint, role = "radio" }: ChoiceCardProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition-colors",
        selected ? "border-primary bg-primary/10" : "hover:bg-accent/60",
      )}
    >
      <span className="flex-1">
        <span className="block font-medium">{title}</span>
        {hint ? <span className="text-muted-foreground block text-sm">{hint}</span> : null}
      </span>
      <span
        aria-hidden
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-input",
        )}
      >
        {selected ? <CheckIcon className="size-4" /> : null}
      </span>
    </button>
  );
}

interface ChipProps {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  role?: "radio" | "checkbox";
  className?: string;
}

/** Kompakter Umschalter für Listen wie Wochentage oder Equipment. */
export function Chip({ selected, onToggle, children, role = "checkbox", className }: ChipProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onToggle}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
        selected ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent/60",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </fieldset>
  );
}
