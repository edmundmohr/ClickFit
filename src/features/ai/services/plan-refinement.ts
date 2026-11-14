/**
 * Plan-Feinschliff mit KI: Das Modell schlägt Änderungen am Wochenplan vor, die App prüft sie
 * und übernimmt nur, was der Nutzer auswählt. Der regelbasierte Generator bleibt die Grundlage.
 */
import type { AppDatabase } from "@/db/client";
import {
  applyPlanChanges,
  validatePlanChanges,
  type CandidateExercise,
  type PlanChange,
  type PlanDaySnapshot,
  type RawPlanChange,
} from "@/domain/ai/plan-changes";
import { filterCandidates } from "@/domain/training/plan-generator";
import type { TrainingProfile } from "@/domain/training/types";
import { getTrainingContext } from "@/features/training/services/context-service";
import { listFolders, type PlanView } from "@/features/training/services/plan-service";
import { saveRoutine } from "@/features/training/services/routine-service";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import type { LlmProvider } from "@/lib/llm";
import { PLAN_SYSTEM_PROMPT, planChangesSchema } from "../prompts";
import { claimAiRequest, unwrapLlmResult } from "./ai-service";

export const MAX_WISH_LENGTH = 500;

export interface PlanSuggestions {
  summary: string;
  changes: PlanChange[];
}

interface PlanBasis {
  plan: PlanView;
  days: PlanDaySnapshot[];
  profile: TrainingProfile;
  candidates: Map<string, CandidateExercise>;
  /** Kandidaten mit den Angaben, die das Modell für die Auswahl braucht. */
  catalogLines: string[];
}

/** Lädt den gespeicherten Wochenplan (ohne Tagesanpassung) und die erlaubten Übungen. */
async function loadBasis(db: AppDatabase, userId: string, today: LocalDate): Promise<PlanBasis> {
  const [context, folders] = await Promise.all([getTrainingContext(db, userId, today), listFolders(db, userId)]);
  const plan = folders.find((folder) => folder.status === "active");
  if (!context.profile || !plan) throw new AppError("PROFILE_REQUIRED");
  const allowed = filterCandidates(context.profile, context.catalog.all);
  return {
    plan,
    profile: context.profile,
    days: plan.days.map((day, index) => ({
      id: day.id,
      title: day.name ?? day.focus ?? `Tag ${index + 1}`,
      exercises: day.exercises.map((entry) => ({
        exerciseId: entry.exercise.id,
        name: entry.exercise.name,
        type: entry.exercise.type,
        sets: entry.sets,
        repMin: entry.repMin,
        repMax: entry.repMax,
        targetRir: entry.targetRir,
        restSeconds: entry.restSeconds,
        groupId: entry.groupId,
      })),
    })),
    candidates: new Map(allowed.map((exercise) => [exercise.id, { id: exercise.id, name: exercise.name, type: exercise.type }])),
    catalogLines: allowed.map(
      (exercise) =>
        `${exercise.id} | ${exercise.name} | ${exercise.mechanic} | ${exercise.pattern} | ${exercise.primary.join(",")}${exercise.type === "duration" ? " | Zeitübung" : ""}`,
    ),
  };
}

/** Der Text, der an das Modell geht. Enthält Trainingsdaten, aber weder Name noch Benutzername. */
export function buildPlanPrompt(basis: Pick<PlanBasis, "days" | "profile" | "catalogLines">, wish: string): string {
  const { profile } = basis;
  const days = basis.days
    .map(
      (day) =>
        `Tag ${day.id} (${day.title}):\n` +
        day.exercises
          .map((item) => `- ${item.exerciseId} | ${item.name} | ${item.sets} x ${item.repMin}-${item.repMax}${item.type === "duration" ? " s" : ""}`)
          .join("\n"),
    )
    .join("\n\n");
  return [
    `Ziel: ${profile.goal}. Erfahrung: ${profile.experience}. Trainingstage pro Woche: ${profile.weekdays.length}. Dauer je Einheit: ${profile.sessionMinutes} Minuten.`,
    `Equipment: ${profile.equipment.length > 0 ? profile.equipment.join(", ") : "keines"}.`,
    `Beschwerden (Körperregionen): ${profile.injuries.length > 0 ? profile.injuries.join(", ") : "keine"}.`,
    `Aktueller Plan:\n${days}`,
    `Erlaubte Übungen (Kennung | Name | Art | Bewegungsmuster | Hauptmuskeln):\n${basis.catalogLines.join("\n")}`,
    `Wunsch der Person:\n"""${wish}"""`,
  ].join("\n\n");
}

/** Holt Vorschläge vom Modell und gibt nur die zurück, die die Prüfung bestehen. */
export async function suggestPlanChanges(
  db: AppDatabase,
  provider: LlmProvider | null,
  userId: string,
  wish: string,
  today: LocalDate,
): Promise<PlanSuggestions> {
  const basis = await loadBasis(db, userId, today);
  const llm = await claimAiRequest(db, provider, userId, today);
  const { data } = unwrapLlmResult(
    await llm.generate({
      system: PLAN_SYSTEM_PROMPT,
      prompt: buildPlanPrompt(basis, wish.trim().slice(0, MAX_WISH_LENGTH)),
      schema: planChangesSchema,
      effort: "medium",
    }),
  );
  return {
    summary: data.summary.trim().slice(0, 600),
    changes: validatePlanChanges(basis.days, data.changes, basis.candidates),
  };
}

/**
 * Übernimmt ausgewählte Vorschläge in den Plan. Die Vorschläge kommen vom Gerät zurück und
 * werden deshalb erneut gegen den aktuellen Plan geprüft. Gibt zurück, wie viele gegriffen haben.
 */
export async function applyPlanSuggestions(
  db: AppDatabase,
  userId: string,
  selected: readonly RawPlanChange[],
  today: LocalDate,
): Promise<number> {
  const basis = await loadBasis(db, userId, today);
  const changes = validatePlanChanges(basis.days, selected, basis.candidates);
  for (const day of basis.days) {
    const own = changes.filter((change) => change.dayId === day.id);
    if (own.length === 0) continue;
    const stored = basis.plan.days.find((item) => item.id === day.id);
    if (!stored) continue;
    await saveRoutine(db, userId, day.id, {
      name: stored.name ?? "",
      weekday: stored.weekday ?? 0,
      folderId: basis.plan.id,
      exercises: applyPlanChanges(day, own, basis.candidates).map((item) => ({
        exerciseId: item.exerciseId,
        sets: item.sets,
        repMin: item.repMin,
        repMax: item.repMax,
        targetRir: item.targetRir,
        restSeconds: item.restSeconds,
        groupId: item.groupId,
      })),
    });
  }
  return changes.length;
}
