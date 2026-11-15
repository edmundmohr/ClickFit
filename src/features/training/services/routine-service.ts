/**
 * Plan-Builder: Pläne und Routinen anlegen, bearbeiten, verschieben, archivieren und löschen;
 * Rolle (Haupt-, Zusatz-, inaktiver Plan) und festen Ort eines Plans setzen.
 */
import { and, asc, desc, eq, max } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { gymProfile, planDay, planExercise, targetWeightChange, trainingPlan } from "@/db/schema";
import { PLAN_STATUSES, planStatusChange, type PlanStatus } from "@/domain/training/plan-roles";
import { isOneOf } from "@/domain/training/types";
import { normalizeGroups } from "@/domain/training/supersets";
import { usesExternalWeight } from "@/domain/training/progression";
import { keptTargetWeight, targetWeightChanges, targetWeightSetAt } from "@/domain/training/target-weight";
import { AppError } from "@/lib/errors";
import { toLocalDate, type LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import type { RoutineInput } from "../schemas";
import { getUserCatalog } from "./exercise-service";
import { chunk, getOwnedDay } from "./plan-service";
import { recordRejection } from "./settings-service";

/** Kennzeichen eigener Ordner und Routinen in den Spalten `split` und `focus`. */
export const CUSTOM_MARK = "custom";

/** Lädt einen Plan des Nutzers; Pläne im Archiv nur mit `includeArchived`. */
async function getOwnedFolder(db: AppDatabase, userId: string, folderId: string, includeArchived = false) {
  const plan = await db.query.trainingPlan.findFirst({
    where: and(eq(trainingPlan.id, folderId), eq(trainingPlan.userId, userId)),
  });
  if (!plan || (plan.status === "archived" && !includeArchived)) throw new AppError("NOT_FOUND");
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
    // Gibt es noch keinen Hauptplan, wird der erste eigene Plan dazu.
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

/** Löscht einen Plan samt Routinen endgültig. Der Hauptplan lässt sich nicht löschen. */
export async function deleteFolder(db: AppDatabase, userId: string, folderId: string): Promise<void> {
  const plan = await getOwnedFolder(db, userId, folderId, true);
  if (plan.status === "active") throw new AppError("PLAN_ACTIVE");
  await db.delete(trainingPlan).where(eq(trainingPlan.id, folderId));
}

/**
 * Setzt die Rolle eines Plans: Hauptplan, Zusatzplan, inaktiv oder Archiv (siehe `planStatusChange`).
 * Wird ein Plan Hauptplan, wird der bisherige inaktiv. Ein neu eingeplanter Plan beginnt heute.
 */
export async function setPlanStatus(
  db: AppDatabase,
  userId: string,
  folderId: string,
  target: PlanStatus,
  now = new Date(),
): Promise<void> {
  const folder = await getOwnedFolder(db, userId, folderId, true);
  const current = isOneOf(PLAN_STATUSES, folder.status) ? folder.status : "saved";
  const change = planStatusChange(current, target);
  if (!change.ok) throw new AppError(change.error);
  if (current === target) return;
  const update = db
    .update(trainingPlan)
    .set({ status: target, updatedAt: now, ...(change.restart ? { startDate: toLocalDate(now) } : {}) })
    .where(eq(trainingPlan.id, folderId));
  if (!change.demoteMain) {
    await update;
    return;
  }
  await db.batch([
    db
      .update(trainingPlan)
      .set({ status: "saved", updatedAt: now })
      .where(and(eq(trainingPlan.userId, userId), eq(trainingPlan.status, "active"))),
    update,
  ]);
}

/** Legt den festen Ort eines Plans fest; `null` = Ort des Tages. */
export async function setPlanGym(db: AppDatabase, userId: string, folderId: string, gymId: string | null): Promise<void> {
  await getOwnedFolder(db, userId, folderId);
  if (gymId !== null) {
    const gym = await db.query.gymProfile.findFirst({
      where: and(eq(gymProfile.id, gymId), eq(gymProfile.userId, userId)),
    });
    if (!gym) throw new AppError("NOT_FOUND");
  }
  await db.update(trainingPlan).set({ gymProfileId: gymId, updatedAt: new Date() }).where(eq(trainingPlan.id, folderId));
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
 * Gelöschte eigene Übungen werden dabei entfernt (der Editor kündigt das an); unbekannte Übungen
 * sind ein Fehler. Geänderte Zielgewichte landen im Verlauf der Übung.
 */
export async function saveRoutine(
  db: AppDatabase,
  userId: string,
  planDayId: string,
  input: RoutineInput,
  now = new Date(),
): Promise<void> {
  const { day, plan } = await getOwnedDay(db, userId, planDayId);
  const targetFolder = input.folderId === plan.id ? plan : await getOwnedFolder(db, userId, input.folderId);
  const catalog = await getUserCatalog(db, userId);
  for (const entry of input.exercises) {
    if (!catalog.find(entry.exerciseId)) throw new AppError("NOT_FOUND");
    if (entry.repMin > entry.repMax) throw new AppError("VALIDATION");
  }
  const before = await db.query.planExercise.findMany({
    columns: { exerciseId: true, targetWeightKg: true, targetWeightSetAt: true },
    where: eq(planExercise.planDayId, planDayId),
    orderBy: asc(planExercise.position),
  });
  // Ein Zielgewicht gibt es nur bei Übungen mit Zusatzgewicht bzw. Unterstützung. Fehlt die Angabe
  // (z. B. „Plan verfeinern“), bleibt das gespeicherte Gewicht der Übung erhalten.
  const exercises = input.exercises.flatMap((entry) => {
    const exercise = catalog.find(entry.exerciseId);
    if (!exercise || exercise.archived) return [];
    const kept = entry.targetWeightKg === undefined ? keptTargetWeight(before, entry.exerciseId) : entry.targetWeightKg;
    return [{ ...entry, targetWeightKg: usesExternalWeight(exercise.type) ? kept : null }];
  });
  const rows = normalizeGroups(exercises).map((entry, position) => ({
    id: newId(),
    planDayId,
    position,
    ...entry,
    targetWeightSetAt: targetWeightSetAt(before, entry.exerciseId, entry.targetWeightKg, now),
  }));
  const changes = targetWeightChanges(before, exercises).map((change) => ({
    id: newId(),
    userId,
    ...change,
    planDayId,
    routineName: input.name || day.name,
    date: toLocalDate(now),
    changedAt: now,
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
    // D1 erlaubt höchstens 100 gebundene Parameter pro Anweisung (11 Spalten × 8 Zeilen).
    ...chunk(rows, 8).map((part) => db.insert(planExercise).values(part)),
    ...chunk(changes, 9).map((part) => db.insert(targetWeightChange).values(part)),
  ]);

  if (plan.source === "generated") {
    // Nur bewusst entfernte Übungen lernen, nicht automatisch entfernte gelöschte.
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
      8,
    ).map((part) => db.insert(planExercise).values(part)),
  ]);
  return id;
}

export interface TargetWeightChangeView {
  id: string;
  date: LocalDate;
  routineName: string | null;
  fromKg: number | null;
  toKg: number | null;
}

/** Die jüngsten Änderungen des eigenen Zielgewichts einer Übung, neueste zuerst. */
export async function listTargetWeightChanges(
  db: AppDatabase,
  userId: string,
  exerciseId: string,
  limit = 20,
): Promise<TargetWeightChangeView[]> {
  const rows = await db.query.targetWeightChange.findMany({
    where: and(eq(targetWeightChange.userId, userId), eq(targetWeightChange.exerciseId, exerciseId)),
    orderBy: desc(targetWeightChange.changedAt),
    limit,
  });
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    routineName: row.routineName,
    fromKg: row.fromKg,
    toKg: row.toKg,
  }));
}
