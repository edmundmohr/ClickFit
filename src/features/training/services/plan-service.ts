import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { planDay, planExercise, trainingPlan } from "@/db/schema";
import type { Exercise } from "@/domain/exercises/types";
import { findAlternatives, generatePlan } from "@/domain/training/plan-generator";
import { estimateSessionSeconds } from "@/domain/training/plan-generator/prescription";
import { DAY_FOCUSES, SPLITS, isOneOf, type DayFocus, type Split, type Weekday } from "@/domain/training/types";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { findExercise, getCatalog } from "../catalog";
import { getProfile, toTrainingProfile } from "./profile-service";

export interface PlanExerciseView {
  id: string;
  exercise: Exercise;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
}

export interface PlanDayView {
  id: string;
  focus: DayFocus;
  weekday: Weekday;
  estimatedMinutes: number;
  exercises: PlanExerciseView[];
}

export interface PlanView {
  id: string;
  split: Split;
  startDate: LocalDate;
  deloadEveryWeeks: number;
  days: PlanDayView[];
}

/**
 * Erzeugt aus dem Profil einen neuen Plan und archiviert den bisherigen.
 * Wird nach dem Onboarding und bei „Plan neu erstellen“ aufgerufen.
 */
export async function createPlanFromProfile(
  db: AppDatabase,
  userId: string,
  today: LocalDate,
  now = new Date(),
): Promise<string> {
  const stored = await getProfile(db, userId);
  if (!stored) throw new AppError("PROFILE_REQUIRED");
  const generated = generatePlan(toTrainingProfile(stored), getCatalog());
  const planId = newId();

  const days = generated.days.map((day, position) => ({
    id: newId(),
    planId,
    position,
    focus: day.focus,
    weekday: day.weekday,
    exercises: day.exercises,
  }));
  const exerciseRows = days.flatMap((day) =>
    day.exercises.map((exercise, position) => ({ id: newId(), planDayId: day.id, position, ...exercise })),
  );
  if (exerciseRows.length === 0) throw new AppError("PLAN_EMPTY");

  await db.batch([
    db
      .update(trainingPlan)
      .set({ status: "archived", updatedAt: now })
      .where(and(eq(trainingPlan.userId, userId), eq(trainingPlan.status, "active"))),
    db.insert(trainingPlan).values({
      id: planId,
      userId,
      split: generated.split,
      source: "generated",
      status: "active",
      gymProfileId: stored.gymProfileId,
      startDate: today,
      deloadEveryWeeks: generated.deloadEveryWeeks,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(planDay).values(
      days.map((day) => ({
        id: day.id,
        planId: day.planId,
        position: day.position,
        focus: day.focus,
        weekday: day.weekday,
      })),
    ),
    // D1 erlaubt höchstens 100 gebundene Parameter pro Anweisung: in kleinen Blöcken einfügen.
    ...chunk(exerciseRows, 10).map((rows) => db.insert(planExercise).values(rows)),
  ]);
  return planId;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

export async function getActivePlan(db: AppDatabase, userId: string): Promise<PlanView | null> {
  const plan = await db.query.trainingPlan.findFirst({
    where: and(eq(trainingPlan.userId, userId), eq(trainingPlan.status, "active")),
  });
  if (!plan) return null;
  const days = await db.query.planDay.findMany({
    where: eq(planDay.planId, plan.id),
    orderBy: asc(planDay.position),
  });
  const exercises =
    days.length === 0
      ? []
      : await db.query.planExercise.findMany({
          where: inArray(
            planExercise.planDayId,
            days.map((day) => day.id),
          ),
          orderBy: asc(planExercise.position),
        });

  return {
    id: plan.id,
    split: isOneOf(SPLITS, plan.split) ? plan.split : "full_body",
    startDate: plan.startDate,
    deloadEveryWeeks: plan.deloadEveryWeeks,
    days: days.map((day) => {
      const dayExercises = exercises
        .filter((row) => row.planDayId === day.id)
        .flatMap((row): PlanExerciseView[] => {
          const exercise = findExercise(row.exerciseId);
          return exercise ? [{ ...row, exercise }] : [];
        });
      return {
        id: day.id,
        focus: isOneOf(DAY_FOCUSES, day.focus) ? day.focus : "full_body_a",
        weekday: day.weekday as Weekday,
        estimatedMinutes: Math.round(estimateSessionSeconds(dayExercises) / 60),
        exercises: dayExercises,
      };
    }),
  };
}

/** Lädt eine Plan-Übung und stellt sicher, dass sie zu einem Plan des Nutzers gehört. */
async function getOwnedPlanExercise(db: AppDatabase, userId: string, planExerciseId: string) {
  const [row] = await db
    .select({ planExercise, planDayId: planDay.id })
    .from(planExercise)
    .innerJoin(planDay, eq(planExercise.planDayId, planDay.id))
    .innerJoin(trainingPlan, eq(planDay.planId, trainingPlan.id))
    .where(and(eq(planExercise.id, planExerciseId), eq(trainingPlan.userId, userId)));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** Alternativen für eine Plan-Übung: ohne Übungen, die am selben Tag schon geplant sind. */
export async function getSwapOptions(
  db: AppDatabase,
  userId: string,
  planExerciseId: string,
): Promise<Exercise[]> {
  const row = await getOwnedPlanExercise(db, userId, planExerciseId);
  const current = findExercise(row.planExercise.exerciseId);
  if (!current) return [];
  const [stored, sameDay] = await Promise.all([
    getProfile(db, userId),
    db.query.planExercise.findMany({
      columns: { exerciseId: true },
      where: eq(planExercise.planDayId, row.planDayId),
    }),
  ]);
  return findAlternatives(current, getCatalog(), {
    equipment: stored?.equipment,
    excludedIds: [...sameDay.map((entry) => entry.exerciseId), ...(stored?.profile.excludedExerciseIds ?? [])],
  });
}

export async function swapPlanExercise(
  db: AppDatabase,
  userId: string,
  planExerciseId: string,
  newExerciseId: string,
): Promise<void> {
  if (!findExercise(newExerciseId)) throw new AppError("NOT_FOUND");
  await getOwnedPlanExercise(db, userId, planExerciseId);
  await db.update(planExercise).set({ exerciseId: newExerciseId }).where(eq(planExercise.id, planExerciseId));
}
