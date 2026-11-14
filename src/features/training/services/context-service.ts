/**
 * Alles, was Plan und Training über die aktuelle Lage wissen müssen: Profil, aktiver
 * Trainingsort (im Reise-Urlaub der Reiseort), Anpassungen und der Übungskatalog.
 */
import type { AppDatabase } from "@/db/client";
import type { CandidateProfile } from "@/domain/training/plan-generator";
import type { TrainingProfile } from "@/domain/training/types";
import { isVacationActive } from "@/domain/training/vacation";
import type { WeightContext, WeightUnit } from "@/domain/training/weights";
import type { LocalDate } from "@/lib/dates";
import { getUserCatalog, type UserCatalog } from "./exercise-service";
import { listGyms, weightContextOf, type GymView } from "./gym-service";
import { getProfile, toTrainingProfile } from "./profile-service";
import { getTrainingSettings, type TrainingSettings } from "./settings-service";

export interface TrainingContext {
  /** `null`, solange der Fragebogen nicht ausgefüllt ist. */
  profile: TrainingProfile | null;
  /** Filter für Ersatzübungen; ohne Profil gilt: alles ist erlaubt. */
  candidateProfile: CandidateProfile | null;
  settings: TrainingSettings;
  /** Der Ort, an dem heute trainiert wird. */
  gym: GymView | null;
  /** Der dauerhaft aktive Ort (ohne Urlaub). */
  homeGym: GymView | null;
  gyms: GymView[];
  catalog: UserCatalog;
}

export async function getTrainingContext(db: AppDatabase, userId: string, today: LocalDate): Promise<TrainingContext> {
  const [stored, settings, gyms, catalog] = await Promise.all([
    getProfile(db, userId),
    getTrainingSettings(db, userId),
    listGyms(db, userId),
    getUserCatalog(db, userId),
  ]);
  const homeGym = gyms.find((gym) => gym.isActive) ?? null;
  const vacation = settings.vacation;
  const travelGym =
    isVacationActive(vacation, today) && vacation.type === "travel"
      ? (gyms.find((gym) => gym.id === vacation.gymProfileId) ?? null)
      : null;
  const gym = travelGym ?? homeGym;
  const base = stored ? toTrainingProfile(stored) : null;
  const profile = base && gym ? { ...base, equipment: gym.equipment } : base;
  return { profile, candidateProfile: profile, settings, gym, homeGym, gyms, catalog };
}

export function weightContext(context: Pick<TrainingContext, "gym">, defaultUnit: WeightUnit): WeightContext {
  return weightContextOf(context.gym, defaultUnit);
}
