/**
 * Formen der Muskelkarte: eine stilisierte Figur in einem Raster von 200 × 420 Einheiten.
 * Jede Muskelgruppe besteht aus Ellipsen oder abgerundeten Rechtecken; paarige Muskeln
 * werden an der Mittelachse (x = 100) gespiegelt.
 */
import type { Muscle } from "@/domain/exercises/types";

export const MAP_WIDTH = 200;
export const MAP_HEIGHT = 420;
export type MapView = "front" | "back";

export type MuscleShape =
  | { kind: "ellipse"; cx: number; cy: number; rx: number; ry: number }
  | { kind: "rect"; x: number; y: number; width: number; height: number; radius: number };

interface ShapeGroup {
  muscle: Muscle;
  shapes: MuscleShape[];
}

const ellipse = (cx: number, cy: number, rx: number, ry: number): MuscleShape => ({ kind: "ellipse", cx, cy, rx, ry });
/** Eine Ellipse links und ihr Spiegelbild rechts. */
const pair = (cx: number, cy: number, rx: number, ry: number): MuscleShape[] => [
  ellipse(cx, cy, rx, ry),
  ellipse(MAP_WIDTH - cx, cy, rx, ry),
];

const FRONT: ShapeGroup[] = [
  { muscle: "traps", shapes: pair(82, 69, 11, 5) },
  { muscle: "front_delts", shapes: pair(63, 85, 10, 11) },
  { muscle: "side_delts", shapes: pair(51, 90, 5, 12) },
  { muscle: "chest", shapes: pair(84, 101, 15, 13) },
  { muscle: "biceps", shapes: pair(50, 124, 8, 17) },
  { muscle: "forearms", shapes: pair(42, 174, 7, 22) },
  { muscle: "abs", shapes: [{ kind: "rect", x: 87, y: 119, width: 26, height: 62, radius: 8 }] },
  { muscle: "obliques", shapes: pair(77, 151, 6, 26) },
  { muscle: "abductors", shapes: pair(70, 210, 5, 12) },
  { muscle: "quads", shapes: pair(83, 262, 12, 40) },
  { muscle: "adductors", shapes: pair(96, 242, 4, 24) },
  { muscle: "calves", shapes: pair(82, 352, 8, 30) },
];

const BACK: ShapeGroup[] = [
  { muscle: "traps", shapes: [ellipse(100, 76, 22, 12)] },
  { muscle: "rear_delts", shapes: pair(62, 87, 10, 10) },
  { muscle: "side_delts", shapes: pair(51, 92, 5, 12) },
  { muscle: "upper_back", shapes: [ellipse(100, 106, 18, 11)] },
  { muscle: "lats", shapes: pair(79, 134, 12, 25) },
  { muscle: "lower_back", shapes: [{ kind: "rect", x: 89, y: 162, width: 22, height: 30, radius: 8 }] },
  { muscle: "triceps", shapes: pair(50, 124, 8, 17) },
  { muscle: "forearms", shapes: pair(42, 174, 7, 22) },
  { muscle: "abductors", shapes: pair(69, 208, 5, 11) },
  { muscle: "glutes", shapes: pair(86, 215, 13, 14) },
  { muscle: "hamstrings", shapes: pair(84, 272, 11, 36) },
  { muscle: "adductors", shapes: pair(97, 256, 3, 20) },
  { muscle: "calves", shapes: pair(83, 350, 9, 30) },
];

export const MUSCLE_SHAPES: Record<MapView, ShapeGroup[]> = { front: FRONT, back: BACK };

/** Umriss der Figur: Kopf, Hals, Rumpf sowie Arme und Beine als dicke, runde Linien. */
export const BODY_OUTLINE = {
  head: { cx: 100, cy: 32, r: 19 },
  neck: { x: 92, y: 48, width: 16, height: 18 },
  torso: "M58 74 Q100 60 142 74 L134 150 Q130 190 136 222 L64 222 Q70 190 66 150 Z",
  limbs: [
    { d: "M52 86 L46 150 L40 212", width: 21 },
    { d: "M148 86 L154 150 L160 212", width: 21 },
    { d: "M84 222 L82 300 L82 392", width: 29 },
    { d: "M116 222 L118 300 L118 392", width: 29 },
  ],
} as const;
