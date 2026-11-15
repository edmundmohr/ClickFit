"use client";

import { useEffect, useId, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { clamp } from "./state";

const ITEM_HEIGHT = 44;
/** Sichtbare Zeilen über und unter der gewählten. */
const SIDE_ROWS = 2;
const PAGE_STEP = 5;

interface WheelPickerProps {
  values: readonly number[];
  value: number;
  onChange: (value: number) => void;
  /** Zugänglicher Name, z. B. „Geburtsjahr“. */
  label: string;
  /** Einheit neben dem Rad, z. B. „cm“. */
  unit?: string;
}

/**
 * Auswahlrad wie am iPhone: Die Liste rastet zeilenweise ein, der Wert in der Mitte gilt.
 * Per Tastatur lässt sich der Wert mit den Pfeiltasten ändern.
 */
export function WheelPicker({ values, value, onChange, label, unit }: WheelPickerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const baseId = useId();
  const index = Math.max(0, values.indexOf(value));

  // Vor dem ersten Zeichnen an die richtige Stelle springen, damit nichts sichtbar rollt.
  useLayoutEffect(() => {
    if (listRef.current) listRef.current.scrollTop = index * ITEM_HEIGHT;
    // Nur beim Einhängen; danach folgt die Liste dem Finger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Änderungen von außen (Tastatur, Antippen einer Zeile) nachführen.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    if (Math.round(list.scrollTop / ITEM_HEIGHT) !== index) list.scrollTo({ top: index * ITEM_HEIGHT });
  }, [index]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  function handleScroll() {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const list = listRef.current;
      if (!list) return;
      const next = values[clamp(Math.round(list.scrollTop / ITEM_HEIGHT), 0, values.length - 1)];
      if (next !== value) onChange(next);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = {
      ArrowUp: -1,
      ArrowDown: 1,
      PageUp: -PAGE_STEP,
      PageDown: PAGE_STEP,
      Home: -values.length,
      End: values.length,
    };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    onChange(values[clamp(index + step, 0, values.length - 1)]);
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <div className="relative w-32">
        <div aria-hidden className="bg-foreground/10 pointer-events-none absolute inset-x-0 top-[88px] h-11 rounded-lg" />
        <div
          ref={listRef}
          role="listbox"
          tabIndex={0}
          aria-label={label}
          aria-activedescendant={`${baseId}-${index}`}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          style={{ height: ITEM_HEIGHT * (SIDE_ROWS * 2 + 1), paddingBlock: ITEM_HEIGHT * SIDE_ROWS }}
          className={cn(
            "relative snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-lg outline-none",
            "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
            "[mask-image:linear-gradient(to_bottom,transparent,black_35%,black_65%,transparent)]",
            "focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          )}
        >
          {values.map((item, position) => (
            <div
              key={item}
              id={`${baseId}-${position}`}
              role="option"
              aria-selected={position === index}
              onClick={() => onChange(item)}
              className={cn(
                "flex h-11 cursor-pointer snap-center items-center justify-center tabular-nums transition-[font-size,color]",
                position === index ? "text-2xl font-semibold" : "text-muted-foreground text-lg",
              )}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
      {unit ? <span className="bg-foreground/10 rounded-lg px-3 py-2 text-xl font-medium">{unit}</span> : null}
    </div>
  );
}

interface RangeSliderProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (value: number) => void;
  /** Gesprochener Wert, z. B. „Seit 2 Jahren“. */
  valueText: string;
}

/** Schieberegler mit großer Griffhöhe; das Aussehen steht in `globals.css` (.range-slider). */
export function RangeSlider({ id, label, min, max, step = 1, value, onChange, valueText }: RangeSliderProps) {
  return (
    <input
      id={id}
      type="range"
      aria-label={label}
      aria-valuetext={valueText}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(Number(event.target.value))}
      style={{ "--fill": `${((value - min) / (max - min)) * 100}%` } as CSSProperties}
      className="range-slider h-11 w-full cursor-pointer"
    />
  );
}

interface SwitchRowProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Ja/Nein-Frage als Zeile mit Schalter; die ganze Zeile ist antippbar. */
export function SwitchRow({ label, checked, onChange }: SwitchRowProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="bg-foreground/5 flex min-h-14 w-full items-center gap-4 rounded-xl px-4 py-3 text-left"
    >
      <span className="flex-1 font-medium">{label}</span>
      <span
        aria-hidden
        className={cn(
          "flex h-7 w-12 shrink-0 items-center rounded-full border p-0.5 transition-colors",
          checked ? "border-transparent bg-[var(--tint)]" : "bg-foreground/10",
        )}
      >
        <span
          className={cn(
            "bg-background size-5.5 rounded-full shadow transition-transform",
            checked ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}

const GAUGE = { cx: 20, cy: 22, radius: 16, needle: 10, gapDegrees: 8 };

function gaugePoint(degrees: number, radius: number): string {
  const radians = (degrees * Math.PI) / 180;
  const x = GAUGE.cx + radius * Math.cos(radians);
  const y = GAUGE.cy - radius * Math.sin(radians);
  return `${x.toFixed(2)} ${y.toFixed(2)}`;
}

/** Kleine Tacho-Anzeige: `level` von `steps` Stufen ist erreicht (0 = erste Stufe). */
export function Gauge({ level, steps }: { level: number; steps: number }) {
  const span = 180 / steps;
  return (
    <svg viewBox="0 0 40 26" className="h-7 w-10 shrink-0" aria-hidden>
      {Array.from({ length: steps }, (_, index) => {
        const start = 180 - index * span - GAUGE.gapDegrees / 2;
        const end = 180 - (index + 1) * span + GAUGE.gapDegrees / 2;
        return (
          <path
            key={index}
            d={`M${gaugePoint(start, GAUGE.radius)} A${GAUGE.radius} ${GAUGE.radius} 0 0 1 ${gaugePoint(end, GAUGE.radius)}`}
            fill="none"
            strokeWidth={3.5}
            strokeLinecap="round"
            stroke={index <= level ? "var(--tint)" : "var(--border)"}
          />
        );
      })}
      <path
        d={`M${GAUGE.cx} ${GAUGE.cy} L${gaugePoint(180 - (level + 0.5) * span, GAUGE.needle)}`}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

interface OptionCardProps {
  selected: boolean;
  onSelect: () => void;
  title: string;
  hint?: string;
  icon?: ReactNode;
  /** Zusatz rechts, z. B. „Empfohlen“ oder ein Warnzeichen. */
  trailing?: ReactNode;
  role?: "radio" | "checkbox";
}

/** Auswahlkarte des Fragebogens: dunkle Fläche, heller Rahmen bei Auswahl. */
export function OptionCard({ selected, onSelect, title, hint, icon, trailing, role = "radio" }: OptionCardProps) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "bg-card/70 flex min-h-14 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors",
        selected ? "border-foreground" : "border-border",
      )}
    >
      {icon}
      <span className="flex-1">
        <span className="block font-semibold">{title}</span>
        {hint ? <span className="text-muted-foreground block text-sm">{hint}</span> : null}
      </span>
      {trailing}
    </button>
  );
}
