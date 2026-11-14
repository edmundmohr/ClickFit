/**
 * Trainingsorte (Gym-Profile): Equipment, Stange, Scheiben und eigene Gewichtsstufen.
 */
import { and, asc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { gymProfile } from "@/db/schema";
import { isEquipment, type Equipment } from "@/domain/exercises/types";
import { LOCATION_TYPES, isOneOf, type LocationType } from "@/domain/training/types";
import {
  DEFAULT_BAR_WEIGHT,
  DEFAULT_PLATES,
  WEIGHT_UNITS,
  type BarSetup,
  type Plate,
  type WeightContext,
  type WeightRule,
  type WeightUnit,
} from "@/domain/training/weights";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/tokens";
import type { GymInput } from "../schemas";

type GymRow = typeof gymProfile.$inferSelect;

export interface GymView {
  id: string;
  name: string | null;
  type: LocationType;
  equipment: Equipment[];
  isActive: boolean;
  /** `null` = Einheit aus den Einstellungen des Nutzers. */
  plateUnit: WeightUnit | null;
  barWeight: number | null;
  plates: Plate[] | null;
  weightRules: WeightRule[];
}

function toView(row: GymRow): GymView {
  return {
    id: row.id,
    name: row.name,
    type: isOneOf(LOCATION_TYPES, row.type) ? row.type : "gym",
    equipment: row.equipment.filter(isEquipment),
    isActive: row.isDefault,
    plateUnit: isOneOf(WEIGHT_UNITS, row.plateUnit) ? row.plateUnit : null,
    barWeight: row.barWeight,
    plates: row.plates,
    weightRules: (row.weightRules ?? []).flatMap((rule): WeightRule[] =>
      isEquipment(rule.equipment) ? [{ ...rule, equipment: rule.equipment }] : [],
    ),
  };
}

export async function listGyms(db: AppDatabase, userId: string): Promise<GymView[]> {
  const rows = await db.query.gymProfile.findMany({
    where: eq(gymProfile.userId, userId),
    orderBy: asc(gymProfile.createdAt),
  });
  return rows.map(toView);
}

export async function getGym(db: AppDatabase, userId: string, gymId: string): Promise<GymView> {
  const row = await db.query.gymProfile.findFirst({
    where: and(eq(gymProfile.id, gymId), eq(gymProfile.userId, userId)),
  });
  if (!row) throw new AppError("NOT_FOUND");
  return toView(row);
}

function toValues(input: GymInput) {
  return {
    name: input.name || null,
    type: input.type,
    equipment: input.equipment,
    plateUnit: input.plateUnit,
    barWeight: input.barWeight,
    plates: input.plates,
    weightRules: input.weightRules,
  };
}

export async function createGym(db: AppDatabase, userId: string, input: GymInput, now = new Date()): Promise<string> {
  const existing = await db.query.gymProfile.findFirst({ where: eq(gymProfile.userId, userId) });
  const id = newId();
  await db.insert(gymProfile).values({
    id,
    userId,
    ...toValues(input),
    // Der erste Ort ist automatisch der aktive.
    isDefault: !existing,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function updateGym(
  db: AppDatabase,
  userId: string,
  gymId: string,
  input: GymInput,
  now = new Date(),
): Promise<void> {
  await getGym(db, userId, gymId);
  await db
    .update(gymProfile)
    .set({ ...toValues(input), updatedAt: now })
    .where(eq(gymProfile.id, gymId));
}

/** Macht einen Ort zum aktiven: Plan und Training richten sich ab jetzt nach seinem Equipment. */
export async function setActiveGym(db: AppDatabase, userId: string, gymId: string, now = new Date()): Promise<void> {
  await getGym(db, userId, gymId);
  await db.batch([
    db.update(gymProfile).set({ isDefault: false, updatedAt: now }).where(eq(gymProfile.userId, userId)),
    db.update(gymProfile).set({ isDefault: true, updatedAt: now }).where(eq(gymProfile.id, gymId)),
  ]);
}

export async function deleteGym(db: AppDatabase, userId: string, gymId: string): Promise<void> {
  const gym = await getGym(db, userId, gymId);
  if (gym.isActive) throw new AppError("GYM_ACTIVE");
  await db.delete(gymProfile).where(eq(gymProfile.id, gymId));
}

/** Stange und Scheiben eines Orts; ohne eigene Angaben gelten übliche Werte der Einheit. */
export function barSetupOf(gym: GymView | null, defaultUnit: WeightUnit): BarSetup {
  const unit = gym?.plateUnit ?? defaultUnit;
  return {
    unit,
    barWeight: gym?.barWeight ?? DEFAULT_BAR_WEIGHT[unit],
    plates: gym?.plates && gym.plates.length > 0 ? gym.plates : DEFAULT_PLATES[unit],
  };
}

/** Einheiten und Gewichtsstufen, die am Ort gelten. */
export function weightContextOf(gym: GymView | null, defaultUnit: WeightUnit): WeightContext {
  const hasOwnBar = !!gym && (gym.plateUnit !== null || gym.barWeight !== null || (gym.plates?.length ?? 0) > 0);
  return {
    defaultUnit,
    rules: gym?.weightRules ?? [],
    bar: hasOwnBar ? barSetupOf(gym, defaultUnit) : null,
  };
}
