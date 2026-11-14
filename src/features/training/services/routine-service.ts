/**
 * Plan-Builder: Ordner und Routinen anlegen, bearbeiten, verschieben und löschen.
 */
import { and, eq, max } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { planDay, planExercise, trainingPlan } from "@/db/schema";
import { normalizeGroups } from "@/domain/training/supersets";
import { AppError } from "@/lib/errors";
import type { LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import type { RoutineInput } from "../schemas";
import { getUserCatalog } from "./exercise-service";
import { chunk, getOwnedDay } from "./plan-service";
import { recordRejection } from "./settings-service";

/** Kennzeichen eigener Ordner und Routinen in den Spalten `split` und `focus`. */
export const CUSTOM_MARK = "custom";

async function getOwnedFolder(db: AppDatabase, userId: string, folderId: string) {
  const plan = await db.query.trainingPlan.findFirst({
    where: and(eq(trainingPlan.id, folderId), eq(trainingPlan.userId, userId)),
  });
  if (!plan || plan.status === "archived") throw new AppError("NOT_FOUND");
  return plan;
}

export async function createFolder(
  db: AppDatabase,
  userId: string,
  name: string,
  today: LocalDate,
  now = new Date(),
): Promise<string> {
  const active = await db.query.trainingPlan.findFirst({
    where: and(eq(trainingPlan.userId, userId), eq(trainingPlan.status, "active")),
  });
  const id = newId();
  await db.insert(trainingPlan).values({
    id,
    userId,
    name,
    split: CUSTOM_MARK,
    source: "custom",
    // Gibt es noch keinen Wochenplan, wird der erste eigene Ordner dazu.
    status: active ? "saved" : "active",
    startDate: today,
    // Eigene Pläne haben keine automatischen Deload-Wochen.
    deloadEveryWeeks: 0,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function renameFolder(db: AppDatabase, userId: string, folderId: string, name: string): Promise<void> {
  await getOwnedFolder(db, userId, folderId);
  await db.update(trainingPlan).set({ name, updatedAt: new Date() }).where(eq(trainingPlan.id, folderId));
}

/** Löscht einen Ordner samt Routinen. Der Wochenplan lässt sich nicht löschen. */
export async function deleteFolder(db: AppDatabase, userId: string, folderId: string): Promise<void> {
  const plan = await getOwnedFolder(db, userId, folderId);
  if (plan.status === "active") throw new AppError("PLAN_ACTIVE");
  await db.delete(trainingPlan).where(eq(trainingPlan.id, folderId));
}

/** Macht einen Ordner zum Wochenplan; der bisherige bleibt als Ordner erhalten. */
export async function activateFolder(db: AppDatabase, userId: string, folderId: string, now = new Date()): Promise<void> {
  await getOwnedFolder(db, userId, folderId);
  await db.batch([
    db
      .update(trainingPlan)
      .set({ status: "saved", updatedAt: now })
      .where(and(eq(trainingPlan.userId, userId), eq(trainingPlan.status, "active"))),
    db.update(trainingPlan).set({ status: "active", updatedAt: now }).where(eq(trainingPlan.id, folderId)),
  ]);
}

async function nextPosition(db: AppDatabase, folderId: string): Promise<number> {
  const [row] = await db.select({ last: max(planDay.position) }).from(planDay).where(eq(planDay.planId, folderId));
  return (row?.last ?? -1) + 1;
}

export async function createRoutine(db: AppDatabase, userId: string, folderId: string, name: string): Promise<string> {
  await getOwnedFolder(db, userId, folderId);
  const id = newId();
  await db.insert(planDay).values({
    id,
    planId: folderId,
    position: await nextPosition(db, folderId),
    focus: CUSTOM_MARK,
    weekday: 0,
    name,
  });
  return id;
}

/**
 * Speichert eine Routine vollständig: Name, Wochentag, Ordner und die Übungen in ihrer Reihenfolge.
 * Fliegt eine Übung aus einem erzeugten Plan, merkt sich das der Generator.
 */
export async function saveRoutine(db: AppDatabase, userId: string, planDayId: string, input: RoutineInput): Promise<void> {
  const { day, plan } = await getOwnedDay(db, userId, planDayId);
  const targetFolder = input.folderId === plan.id ? plan : await getOwnedFolder(db, userId, input.folderId);
  const catalog = await getUserCatalog(db, userId);
  for (const entry of input.exercises) {
    const exercise = catalog.find(entry.exerciseId);
    if (!exercise || exercise.archived) throw new AppError("NOT_FOUND");
    if (entry.repMin > entry.repMax) throw new AppError("VALIDATION");
  }

  const before = await db.query.planExercise.findMany({
    columns: { exerciseId: true },
    where: eq(planExercise.planDayId, planDayId),
  });
  const rows = normalizeGroups(input.exercises).map((entry, position) => ({
    id: newId(),
    planDayId,
    position,
    ...entry,
  }));
  const moved = targetFolder.id !== plan.id;

  await db.batch([
    db
      .update(planDay)
      .set({
        // Erzeugte Tage behalten ihren Fokus als Namen, solange kein eigener vergeben wird.
        name: input.name || null,
        weekday: input.weekday,
        planId: targetFolder.id,
        position: moved ? await nextPosition(db, targetFolder.id) : day.position,
      })
      .where(eq(planDay.id, planDayId)),
    db.delete(planExercise).where(eq(planExercise.planDayId, planDayId)),
    ...chunk(rows, 9).map((part) => db.insert(planExercise).values(part)),
  ]);

  if (plan.source === "generated") {
    const kept = new Set(input.exercises.map((entry) => entry.exerciseId));
    const removed = [...new Set(before.map((row) => row.exerciseId))].filter((id) => !kept.has(id));
    for (const exerciseId of removed) await recordRejection(db, userId, exerciseId, "removed");
  }
}

export async function deleteRoutine(db: AppDatabase, userId: string, planDayId: string): Promise<void> {
  await getOwnedDay(db, userId, planDayId);
  await db.delete(planDay).where(eq(planDay.id, planDayId));
}

/** Kopiert eine Routine in denselben Ordner (ohne festen Wochentag). */
export async function duplicateRoutine(db: AppDatabase, userId: string, planDayId: string, name: string): Promise<string> {
  const { day } = await getOwnedDay(db, userId, planDayId);
  const exercises = await db.query.planExercise.findMany({ where: eq(planExercise.planDayId, planDayId) });
  const id = newId();
  await db.batch([
    db.insert(planDay).values({
      id,
      planId: day.planId,
      position: await nextPosition(db, day.planId),
      focus: day.focus,
      weekday: 0,
      name,
    }),
    ...chunk(
      exercises.map((row) => ({ ...row, id: newId(), planDayId: id })),
      9,
    ).map((part) => db.insert(planExercise).values(part)),
  ]);
  return id;
}
