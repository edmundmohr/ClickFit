"use client";

import type { Muscle } from "@/domain/exercises/types";
import { cn } from "@/lib/utils";
import {
  BODY_OUTLINE,
  MAP_HEIGHT,
  MAP_WIDTH,
  MUSCLE_SHAPES,
  type MapView,
  type MuscleShape,
} from "../muscle-map-shapes";

interface MuscleMapProps {
  view: MapView;
  /** Zugänglicher Name der Ansicht, z. B. „Muskelkarte Vorderseite“. */
  label: string;
  /** Füllfarbe je Muskelgruppe als CSS-Farbe. */
  fills: Record<Muscle, string>;
  /** Beschriftung je Muskelgruppe für Screenreader, z. B. „Brust: 80 % erholt“. */
  labels: Record<Muscle, string>;
  selected: Muscle | null;
  onSelect: (muscle: Muscle) => void;
}

function Shape({ shape }: { shape: MuscleShape }) {
  return shape.kind === "ellipse" ? (
    <ellipse cx={shape.cx} cy={shape.cy} rx={shape.rx} ry={shape.ry} />
  ) : (
    <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.radius} />
  );
}

/** Stilisierte Körperansicht; jede Muskelgruppe ist antippbar und per Tastatur erreichbar. */
export function MuscleMap({ view, label, fills, labels, selected, onSelect }: MuscleMapProps) {
  return (
    <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} role="group" aria-label={label} className="w-full">
      <g fill="var(--secondary)" stroke="var(--secondary)" strokeLinecap="round" strokeLinejoin="round">
        <circle cx={BODY_OUTLINE.head.cx} cy={BODY_OUTLINE.head.cy} r={BODY_OUTLINE.head.r} stroke="none" />
        <rect {...BODY_OUTLINE.neck} stroke="none" />
        <path d={BODY_OUTLINE.torso} stroke="none" />
        {BODY_OUTLINE.limbs.map((limb) => (
          <path key={limb.d} d={limb.d} fill="none" strokeWidth={limb.width} />
        ))}
      </g>
      {MUSCLE_SHAPES[view].map((group) => (
        <g
          key={group.muscle}
          role="button"
          tabIndex={0}
          aria-label={labels[group.muscle]}
          aria-pressed={selected === group.muscle}
          onClick={() => onSelect(group.muscle)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onSelect(group.muscle);
          }}
          fill={fills[group.muscle]}
          stroke={selected === group.muscle ? "var(--foreground)" : "var(--card)"}
          strokeWidth={selected === group.muscle ? 2.5 : 1.5}
          className={cn("cursor-pointer outline-none focus-visible:stroke-[var(--ring)]")}
        >
          {group.shapes.map((shape, index) => (
            <Shape key={index} shape={shape} />
          ))}
        </g>
      ))}
    </svg>
  );
}
