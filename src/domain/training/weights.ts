/**
 * Flexible Gewichte: Einheiten je Gerät (kg und lbs gemischt), eigene Gewichtsstufen
 * und der Scheiben-Rechner. Intern wird immer in kg gerechnet.
 */
import type { Equipment } from "@/domain/exercises/types";

export const WEIGHT_UNITS = ["kg", "lbs"] as const;
export type WeightUnit = (typeof WEIGHT_UNITS)[number];

export const KG_PER_LB = 0.45359237;

export function toKg(value: number, unit: WeightUnit): number {
  return unit === "lbs" ? value * KG_PER_LB : value;
}

export function fromKg(weightKg: number, unit: WeightUnit): number {
  return unit === "lbs" ? weightKg / KG_PER_LB : weightKg;
}

/** Eigene Stufen eines Geräts an einem Trainingsort, in der dort üblichen Einheit. */
export interface WeightRule {
  equipment: Equipment;
  unit: WeightUnit;
  /** Kleinster Sprung; `null`, wenn nur die feste Liste gilt. */
  increment: number | null;
  /** Feste Liste vorhandener Gewichte (z. B. Kurzhanteln). Leer = beliebige Vielfache des Sprungs. */
  values: number[];
}

export interface Plate {
  /** Gewicht einer Scheibe in der Scheiben-Einheit. */
  weight: number;
  /** Anzahl der vorhandenen Paare. */
  pairs: number;
}

export interface BarSetup {
  unit: WeightUnit;
  barWeight: number;
  plates: Plate[];
}

/** Geräte, die mit Scheiben beladen werden. */
export const PLATE_LOADED: readonly Equipment[] = ["barbell", "ez_bar", "smith_machine"];

export const DEFAULT_BAR_WEIGHT: Record<WeightUnit, number> = { kg: 20, lbs: 45 };

export const DEFAULT_PLATES: Record<WeightUnit, Plate[]> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25].map((weight) => ({ weight, pairs: weight >= 20 ? 4 : 2 })),
  lbs: [45, 35, 25, 10, 5, 2.5].map((weight) => ({ weight, pairs: weight >= 45 ? 4 : 2 })),
};

/** Rundet Rechenfehler der Gleitkommazahlen weg (drei Nachkommastellen genügen für Gewichte). */
function clean(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface PlateLoad {
  /** Scheiben pro Seite, schwerste zuerst, in der Scheiben-Einheit. */
  perSide: number[];
  /** Tatsächlich geladenes Gesamtgewicht in der Scheiben-Einheit. */
  total: number;
  /** Differenz zum Wunschgewicht (positiv = es fehlt etwas). */
  missing: number;
}

/**
 * Scheiben-Rechner: sucht die Beladung pro Seite, die dem Wunschgewicht am nächsten kommt,
 * ohne es zu überschreiten. Probiert alle Kombinationen durch, weil die vorhandenen Scheiben
 * begrenzt sind und „immer die größte zuerst“ dann nicht immer die beste Lösung findet.
 */
export function calculatePlates(target: number, setup: BarSetup): PlateLoad {
  const sizes = [...setup.plates].filter((plate) => plate.weight > 0 && plate.pairs > 0).sort((a, b) => b.weight - a.weight);
  const perSideTarget = clean((target - setup.barWeight) / 2);
  if (perSideTarget <= 0 || sizes.length === 0) {
    return { perSide: [], total: setup.barWeight, missing: clean(Math.max(target - setup.barWeight, 0)) };
  }

  let best: { load: number; counts: number[]; plates: number } = { load: 0, counts: sizes.map(() => 0), plates: 0 };
  const counts = sizes.map(() => 0);
  const search = (index: number, load: number, plates: number) => {
    if (load > best.load + 1e-9 || (Math.abs(load - best.load) < 1e-9 && plates < best.plates)) {
      best = { load, counts: [...counts], plates };
    }
    if (index >= sizes.length) return;
    const size = sizes[index];
    const max = Math.min(size.pairs, Math.floor((perSideTarget - load + 1e-9) / size.weight));
    for (let count = max; count >= 0; count--) {
      counts[index] = count;
      search(index + 1, load + count * size.weight, plates + count);
    }
    counts[index] = 0;
  };
  search(0, 0, 0);

  const perSide = sizes.flatMap((size, index) => Array.from({ length: best.counts[index] }, () => size.weight));
  const total = clean(setup.barWeight + best.load * 2);
  return { perSide, total, missing: clean(target - total) };
}

/** Kleinster Sprung an der Stange: zwei der kleinsten Scheiben. */
export function plateIncrement(setup: BarSetup): number | null {
  const smallest = setup.plates.filter((plate) => plate.pairs > 0 && plate.weight > 0).map((plate) => plate.weight);
  return smallest.length === 0 ? null : clean(Math.min(...smallest) * 2);
}

/**
 * Gewichtsleiter einer Übung: welche Gewichte es gibt und was die nächste Stufe ist.
 * Alle Ein- und Ausgaben in kg.
 */
export interface WeightLadder {
  unit: WeightUnit;
  /** Kleinster Sprung in kg (für Anzeige und Aufwärm-Rechner). */
  incrementKg: number;
  /**
   * Kleinstes einstellbares Gewicht in kg: die leere Stange, das leichteste Gewicht der festen
   * Liste, sonst 0. Untergrenze z. B. für die Aufwärmsätze.
   */
  minWeightKg: number;
  /** Nächste Stufe über dem Gewicht; liegt es schon über der höchsten Stufe, bleibt es. */
  up: (weightKg: number) => number;
  /** Nächste Stufe unter dem Gewicht; liegt es schon unter der kleinsten Stufe, bleibt es. */
  down: (weightKg: number) => number;
  /** Nächstliegende vorhandene Stufe (nie unter dem Mindestgewicht). */
  nearest: (weightKg: number) => number;
}

const EPSILON_KG = 0.005;

export interface LadderInput {
  unit: WeightUnit;
  /** Sprung in der Einheit. */
  increment: number;
  /** Feste Liste in der Einheit; leer = Vielfache des Sprungs. */
  values?: readonly number[];
  /** Untergrenze in der Einheit (z. B. leere Stange). */
  min?: number;
}

export function createLadder(input: LadderInput): WeightLadder {
  const { unit } = input;
  const step = input.increment > 0 ? input.increment : 1;
  const min = Math.max(input.min ?? 0, 0);
  const fixed = [...new Set(input.values ?? [])].filter((value) => value >= 0).sort((a, b) => a - b);
  const kg = (value: number) => clean(toKg(value, unit));
  const native = (weightKg: number) => fromKg(weightKg, unit);

  if (fixed.length > 0) {
    const nearestFixed = (value: number) =>
      fixed.reduce((best, candidate) => (Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best));
    const lowest = kg(fixed[0]);
    const highest = kg(fixed[fixed.length - 1]);
    return {
      unit,
      incrementKg: kg(fixed.length > 1 ? Math.min(...fixed.slice(1).map((value, index) => value - fixed[index])) : step),
      minWeightKg: lowest,
      // Über der höchsten bzw. unter der kleinsten Stufe gibt es keine weitere: Gewicht halten.
      up: (weightKg) => {
        const next = fixed.find((value) => toKg(value, unit) > weightKg + EPSILON_KG);
        return next === undefined ? Math.max(highest, weightKg) : kg(next);
      },
      down: (weightKg) => {
        const next = [...fixed].reverse().find((value) => toKg(value, unit) < weightKg - EPSILON_KG);
        return next === undefined ? Math.min(lowest, weightKg) : kg(next);
      },
      nearest: (weightKg) => kg(nearestFixed(native(weightKg))),
    };
  }

  // Stufen sind `min + n × step`, damit z. B. eine 20-kg-Stange mit 2,5-kg-Sprüngen aufgeht.
  const snap = (value: number, round: (n: number) => number) =>
    Math.max(min, clean(min + round((value - min) / step) * step));
  const minKg = kg(min);
  return {
    unit,
    incrementKg: kg(step),
    minWeightKg: minKg,
    // Unter dem Mindestgewicht (z. B. leichter als die leere Stange) ist die nächste Stufe das Mindestgewicht.
    up: (weightKg) =>
      weightKg < minKg - EPSILON_KG ? minKg : kg(snap(native(weightKg + EPSILON_KG), Math.floor) + step),
    // Am Mindestgewicht geht es nicht weiter nach unten; darunter wird nicht erhöht.
    down: (weightKg) =>
      weightKg <= minKg + EPSILON_KG
        ? Math.min(minKg, weightKg)
        : kg(Math.max(min, snap(native(weightKg - EPSILON_KG), Math.ceil) - step)),
    nearest: (weightKg) => kg(snap(native(weightKg), Math.round)),
  };
}

/** Übliche Sprünge je Gerät, wenn nichts eingestellt ist (kg bzw. lbs). */
const DEFAULT_INCREMENT: Partial<Record<Equipment, Record<WeightUnit, number>>> = {
  barbell: { kg: 2.5, lbs: 5 },
  ez_bar: { kg: 2.5, lbs: 5 },
  smith_machine: { kg: 2.5, lbs: 5 },
  dumbbell: { kg: 2, lbs: 5 },
  kettlebell: { kg: 4, lbs: 10 },
  machine: { kg: 5, lbs: 10 },
  cable: { kg: 2.5, lbs: 5 },
};
const FALLBACK_INCREMENT: Record<WeightUnit, number> = { kg: 2.5, lbs: 5 };

export interface WeightContext {
  /** Einheit aus den Einstellungen des Nutzers. */
  defaultUnit: WeightUnit;
  rules: readonly WeightRule[];
  /** Stange und Scheiben des Trainingsorts; `null`, wenn nichts eingestellt ist. */
  bar: BarSetup | null;
}

/** Das Gerät, das die Gewichtsstufen einer Übung bestimmt (das erste mit Regel oder üblichem Sprung). */
function loadEquipment(equipment: readonly Equipment[], rules: readonly WeightRule[]): Equipment | null {
  return (
    equipment.find((item) => rules.some((rule) => rule.equipment === item)) ??
    equipment.find((item) => DEFAULT_INCREMENT[item] !== undefined) ??
    null
  );
}

/** Einheit und Stufen für eine Übung am aktuellen Trainingsort. */
export function ladderFor(equipment: readonly Equipment[], context: WeightContext): WeightLadder {
  const item = loadEquipment(equipment, context.rules);
  const rule = context.rules.find((entry) => entry.equipment === item);
  if (rule) {
    const increment = rule.increment ?? DEFAULT_INCREMENT[rule.equipment]?.[rule.unit] ?? FALLBACK_INCREMENT[rule.unit];
    // Auch mit eigenen Stufen ist die leere Stange die unterste Stufe (in der Einheit der Regel).
    const barMin =
      PLATE_LOADED.includes(rule.equipment) && context.bar
        ? clean(fromKg(toKg(context.bar.barWeight, context.bar.unit), rule.unit))
        : undefined;
    return createLadder({ unit: rule.unit, increment, values: rule.values, min: barMin });
  }
  if (item && PLATE_LOADED.includes(item) && context.bar) {
    const increment = plateIncrement(context.bar) ?? FALLBACK_INCREMENT[context.bar.unit];
    // Leichter als die leere Stange geht nicht: Sie ist die unterste Stufe.
    return createLadder({ unit: context.bar.unit, increment, min: context.bar.barWeight });
  }
  const unit = context.defaultUnit;
  return createLadder({ unit, increment: (item && DEFAULT_INCREMENT[item]?.[unit]) ?? FALLBACK_INCREMENT[unit] });
}

/** Ob für die Übung der Scheiben-Rechner sinnvoll ist. */
export function usesPlates(equipment: readonly Equipment[]): boolean {
  return equipment.some((item) => PLATE_LOADED.includes(item));
}

/**
 * Liest eine Liste vorhandener Gewichte in Zahlen; ungültige Teile entfallen.
 *
 * Regeln (eindeutig, auch für das deutsche Dezimalkomma):
 * 1. Leerzeichen und Semikolons trennen immer.
 * 2. Ein Komma mit folgendem Leerzeichen trennt immer („2, 4“).
 * 3. In einem übrigen Teil ohne Leerzeichen gilt ein einzelnes Komma als Dezimalkomma
 *    („6,5“ = 6,5). Enthält der Teil mehrere Kommas oder zusätzlich einen Punkt, trennen
 *    die Kommas („2,4,6,8“, „2.5,5,7.5“).
 *
 * Beispiele: „2, 4, 6,5 8“ → 2, 4, 6,5, 8 · „2,4,6,8“ → 2, 4, 6, 8 · „2;4;6“ → 2, 4, 6.
 */
export function parseWeightList(input: string): number[] {
  const values = input
    .split(/[\s;]+|,(?=\s)/)
    .flatMap((part) => {
      const commas = part.split(",").length - 1;
      return commas > 1 || (commas === 1 && part.includes(".")) ? part.split(",") : [part.replace(",", ".")];
    })
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
  return [...new Set(values)].sort((a, b) => a - b);
}
