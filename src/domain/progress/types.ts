/**
 * Grundtypen der Auswertungen. Reine Typen ohne Framework.
 */
import type { Exercise, Muscle } from "@/domain/exercises/types";
import type { SetType } from "@/domain/training/types";
import type { LocalDate } from "@/lib/dates";

/** Ein abgeschlossener Satz aus dem Verlauf. */
export interface TrainedSet {
  exerciseId: string;
  sessionId: string;
  /** Lokales Datum der Einheit. */
  date: LocalDate;
  /** Zeitpunkt, zu dem der Satz abgehakt wurde. */
  completedAt: Date;
  type: SetType;
  weightKg: number | null;
  reps: number | null;
  rir: number | null;
}

export type ExerciseLookup = (exerciseId: string) => Exercise | null | undefined;

/** Körperbereiche für die Verteilung des Volumens. */
export const BODY_AREAS = ["push", "pull", "core", "legs"] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

export const MUSCLE_AREA: Record<Muscle, BodyArea> = {
  chest: "push",
  front_delts: "push",
  side_delts: "push",
  triceps: "push",
  lats: "pull",
  upper_back: "pull",
  traps: "pull",
  rear_delts: "pull",
  biceps: "pull",
  forearms: "pull",
  abs: "core",
  obliques: "core",
  lower_back: "core",
  glutes: "legs",
  quads: "legs",
  hamstrings: "legs",
  calves: "legs",
  adductors: "legs",
  abductors: "legs",
};

/** Körperstellen für Umfänge. */
export const MEASUREMENT_SITES = [
  "waist",
  "chest",
  "hips",
  "upper_arm",
  "forearm",
  "thigh",
  "calf",
  "shoulders",
  "neck",
] as const;
export type MeasurementSite = (typeof MEASUREMENT_SITES)[number];
