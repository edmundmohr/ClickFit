/**
 * Erholungsstand aus allen Quellen: Krafttraining, manuelle Werte sowie Cardio und Zusatzsport.
 */
import type { AppDatabase } from "@/db/client";
import type { MuscleValues } from "@/domain/progress/muscle-load";
import { RECOVERY_LOOKBACK_DAYS, recoveryStatus } from "@/domain/progress/recovery";
import type { ExerciseLookup } from "@/domain/progress/types";
import { getActivityLoads } from "@/features/cardio/services/activity-service";
import { addDays, toLocalDate } from "@/lib/dates";
import { getRecoveryOverrides, getTrainedSets } from "./progress-service";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Erholung aller Muskelgruppen (0–100 %) zum Zeitpunkt `now`. */
export async function getRecoverySnapshot(
  db: AppDatabase,
  userId: string,
  lookup: ExerciseLookup,
  now = new Date(),
): Promise<MuscleValues> {
  const [sets, overrides, extraLoads] = await Promise.all([
    getTrainedSets(db, userId, { from: addDays(toLocalDate(now), -RECOVERY_LOOKBACK_DAYS) }),
    getRecoveryOverrides(db, userId),
    getActivityLoads(db, userId, new Date(now.getTime() - RECOVERY_LOOKBACK_DAYS * DAY_MS)),
  ]);
  return recoveryStatus(sets, lookup, now, overrides, extraLoads);
}
