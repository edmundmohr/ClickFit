/**
 * Pläne lesen und erzeugen. Ein Plan ist zugleich ein Ordner für Routinen (Plantage);
 * der aktive Plan ist der Wochenplan. Bearbeiten: siehe routine-service.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { planDay, planExercise, trainingPlan } from "@/db/schema";
import { LEG_DOMINANT_ACTIVITIES } from "@/domain/cardio/types";
import type { Exercise } from "@/domain/exercises/types";
import { adaptDay, estimateDaySeconds, type SubstitutionReason } from "@/domain/training/adaptation";
import { findAlternatives, generatePlan } from "@/domain/training/plan-generator";
import { DAY_FOCUSES, SPLITS, isOneOf, type DayFocus, type Split, type Weekday } from "@/domain/training/types";
import { AppError } from "@/lib/errors";
import { toLocalDate, type LocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { getTrainingContext, type TrainingContext } from "./context-service";
import { getUserCatalog } from "./exercise-service";
import { getProfile, toTrainingProfile } from "./profile-service";
import { getPreferences, getTrainingSettings, recordRejection } from "./settings-service";

export interface PlanExerciseView {
  id: string;
  exercise: Exercise;
  sets: number;
  repMin: number;
  repMax: number;
  targetRir: number;
  restSeconds: number;
  groupId: string | null;
  /** Die eigentlich geplante Übung, wenn sie für heute ersetzt wurde. */
  replaces: Exercise | null;
  reason: SubstitutionReason | null;
}

export interface PlanDayView {
  id: string;
  planId: string;
  /** Eigener Name der Routine; bei erzeugten Tagen `null` (Anzeige über den Fokus). */
  name: string | null;
  focus: DayFocus | null;
  /** `null` = Routine ohne festen Wochentag. */
  weekday: Weekday | null;
  estimatedMinutes: number;
  exercises: PlanExerciseView[];
  /** Geplante Übungen, die heute nicht möglich sind und für die es keinen Ersatz gibt. */
  dropped: { exercise: Exercise; reason: SubstitutionReason }[];
}

export const PLAN_SOURCES = ["generated", "custom"] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];
export type PlanStatus = "active" | "saved";

export interface PlanView {
  id: string;
  /** Name des Ordners; bei erzeugten Plänen `null` (Anzeige über den Split). */
  name: string | null;
  split: Split | null;
  source: PlanSource;
  status: PlanStatus;
  startDate: LocalDate;
  deloadEveryWeeks: number;
  days: PlanDayView[];
}

type PlanRow = typeof trainingPlan.$inferSelect;
type DayRow = typeof planDay.$inferSelect;
type ExerciseRow = typeof planExercise.$inferSelect;
type Adaptation = Pick<TrainingContext, "catalog" | "candidateProfile">;

export function toWeekdayOrNull(value: number): Weekday | null {
  return Number.isInteger(value) && value >= 1 && value <= 7 ? (value as Weekday) : null;
}

function toDayView(day: DayRow, rows: ExerciseRow[], context: Adaptation, adapt: boolean): PlanDayView {
  const adapted =
    adapt && context.candidateProfile
      ? adaptDay(rows, context.catalog.find, context.catalog.all, context.candidateProfile)
      : {
          items: rows.flatMap((entry) => {
            const exercise = context.catalog.find(entry.exerciseId);
            return exercise ? [{ entry, exercise, replaces: null, reason: null }] : [];
          }),
          dropped: [],
        };
  return {
    id: day.id,
    planId: day.planId,
    name: day.name,
    focus: isOneOf(DAY_FOCUSES, day.focus) ? day.focus : null,
    weekday: toWeekdayOrNull(day.weekday),
    estimatedMinutes: Math.round(estimateDaySeconds(adapted.items.map((item) => item.entry)) / 60),
    exercises: adapted.items.map(({ entry, exercise, replaces, reason }) => ({
      id: entry.id,
      exercise,
      sets: entry.sets,
      repMin: entry.repMin,
      repMax: entry.repMax,
      targetRir: entry.targetRir,
      restSeconds: entry.restSeconds,
      groupId: entry.groupId,
      replaces,
      reason,
    })),
    dropped: adapted.dropped,
  };
}

async function loadPlanViews(db: AppDatabase, plans: PlanRow[], context: Adaptation, adapt: boolean): Promise<PlanView[]> {
  if (plans.length === 0) return [];
  const days = await db.query.planDay.findMany({
    where: inArray(
      planDay.planId,
      plans.map((plan) => plan.id),
    ),
    orderBy: asc(planDay.position),
  });
  // D1 erlaubt höchstens 100 gebundene Parameter: Tage in Blöcken abfragen.
  const exercises: ExerciseRow[] = [];
  for (const ids of chunk(
    days.map((day) => day.id),
    50,
  )) {
    exercises.push(
      ...(await db.query.planExercise.findMany({
        where: inArray(planExercise.planDayId, ids),
        orderBy: asc(planExercise.position),
      })),
    );
  }
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    split: isOneOf(SPLITS, plan.split) ? plan.split : null,
    source: isOneOf(PLAN_SOURCES, plan.source) ? plan.source : "generated",
    status: plan.status === "active" ? "active" : "saved",
    startDate: plan.startDate,
    deloadEveryWeeks: plan.deloadEveryWeeks,
    days: days
      .filter((day) => day.planId === plan.id)
      .map((day) =>
        toDayView(
          day,
          exercises.filter((row) => row.planDayId === day.id),
          context,
          adapt,
        ),
      ),
  }));
}

export function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

/**
 * Erzeugt aus dem Profil einen neuen Plan und macht ihn zum Wochenplan. Ein bisher aktiver
 * erzeugter Plan wird archiviert; ein selbst gebauter bleibt als Ordner erhalten.
 */
export async function createPlanFromProfile(
  db: AppDatabase,
  userId: string,
  today: LocalDate,
  now = new Date(),
): Promise<string> {
  const stored = await getProfile(db, userId);
  if (!stored) throw new AppError("PROFILE_REQUIRED");
  const [catalog, preferences, settings, previous] = await Promise.all([
    getUserCatalog(db, userId),
    getPreferences(db, userId, today),
    getTrainingSettings(db, userId),
    db.query.trainingPlan.findFirst({
      where: and(eq(trainingPlan.userId, userId), eq(trainingPlan.status, "active")),
    }),
  ]);
  const generated = generatePlan(toTrainingProfile(stored), catalog.all, {
    preferences,
    includeGrip: settings.gripModule,
    legSportSessions: settings.extraSports
      .filter((sport) => LEG_DOMINANT_ACTIVITIES.includes(sport.type))
      .reduce((total, sport) => total + sport.sessionsPerWeek, 0),
  });
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
      .set({ status: previous?.source === "custom" ? "saved" : "archived", updatedAt: now })
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

/**
 * Der Wochenplan, angepasst an die heutige Lage: Übungen, die am aktuellen Ort, wegen
 * Beschwerden oder Ausschlüssen nicht passen, sind durch Alternativen ersetzt.
 */
export async function getActivePlan(
  db: AppDatabase,
  userId: string,
  today: LocalDate = toLocalDate(new Date()),
  /** Bereits geladener Kontext, damit er nicht doppelt abgefragt wird. */
  loaded?: TrainingContext,
): Promise<PlanView | null> {
  const plan = await db.query.trainingPlan.findFirst({
    where: and(eq(trainingPlan.userId, userId), eq(trainingPlan.status, "active")),
  });
  if (!plan) return null;
  const context = loaded ?? (await getTrainingContext(db, userId, today));
  const [view] = await loadPlanViews(db, [plan], context, true);
  return view ?? null;
}

/** Alle Ordner mit ihren Routinen, der Wochenplan zuerst. Ohne Anpassung: so, wie sie gespeichert sind. */
export async function listFolders(db: AppDatabase, userId: string): Promise<PlanView[]> {
  const [plans, catalog] = await Promise.all([
    db.query.trainingPlan.findMany({
      where: and(eq(trainingPlan.userId, userId), inArray(trainingPlan.status, ["active", "saved"])),
      orderBy: asc(trainingPlan.createdAt),
    }),
    getUserCatalog(db, userId),
  ]);
  const views = await loadPlanViews(db, plans, { catalog, candidateProfile: null }, false);
  return views.sort((a, b) => Number(b.status === "active") - Number(a.status === "active"));
}

/** Lädt einen Plantag und stellt sicher, dass er zu einem Plan des Nutzers gehört. */
export async function getOwnedDay(db: AppDatabase, userId: string, planDayId: string) {
  const [row] = await db
    .select({ day: planDay, plan: trainingPlan })
    .from(planDay)
    .innerJoin(trainingPlan, eq(planDay.planId, trainingPlan.id))
    .where(and(eq(planDay.id, planDayId), eq(trainingPlan.userId, userId)));
  if (!row) throw new AppError("NOT_FOUND");
  return row;
}

/** Eine Routine zum Bearbeiten: unverändert, mit dem Ordner, in dem sie liegt. */
export async function getRoutine(
  db: AppDatabase,
  userId: string,
  planDayId: string,
): Promise<{ day: PlanDayView; folder: Pick<PlanView, "id" | "name" | "split" | "source" | "status"> }> {
  const { plan } = await getOwnedDay(db, userId, planDayId);
  const catalog = await getUserCatalog(db, userId);
  const [view] = await loadPlanViews(db, [plan], { catalog, candidateProfile: null }, false);
  const day = view?.days.find((item) => item.id === planDayId);
  if (!view || !day) throw new AppError("NOT_FOUND");
  return { day, folder: { id: view.id, name: view.name, split: view.split, source: view.source, status: view.status } };
}

/** Lädt eine Plan-Übung und stellt sicher, dass sie zu einem Plan des Nutzers gehört. */
async function getOwnedPlanExercise(db: AppDatabase, userId: string, planExerciseId: string) {
  const [row] = await db
    .select({ planExercise, planDayId: planDay.id, source: trainingPlan.source })
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
  today: LocalDate = toLocalDate(new Date()),
): Promise<Exercise[]> {
  const row = await getOwnedPlanExercise(db, userId, planExerciseId);
  const [context, sameDay] = await Promise.all([
    getTrainingContext(db, userId, today),
    db.query.planExercise.findMany({
      columns: { exerciseId: true },
      where: eq(planExercise.planDayId, row.planDayId),
    }),
  ]);
  const current = context.catalog.find(row.planExercise.exerciseId);
  if (!current) return [];
  return findAlternatives(current, context.catalog.all, {
    equipment: context.profile?.equipment,
    excludedIds: [...sameDay.map((entry) => entry.exerciseId), ...(context.profile?.excludedExerciseIds ?? [])],
  });
}

/** Tauscht eine Übung im Plan. Bei erzeugten Plänen merkt sich der Generator den abgelehnten Vorschlag. */
export async function swapPlanExercise(
  db: AppDatabase,
  userId: string,
  planExerciseId: string,
  newExerciseId: string,
): Promise<void> {
  const [catalog, row] = await Promise.all([
    getUserCatalog(db, userId),
    getOwnedPlanExercise(db, userId, planExerciseId),
  ]);
  const replacement = catalog.find(newExerciseId);
  if (!replacement || replacement.archived) throw new AppError("NOT_FOUND");
  const previousId = row.planExercise.exerciseId;
  await db.update(planExercise).set({ exerciseId: newExerciseId }).where(eq(planExercise.id, planExerciseId));
  if (row.source === "generated" && previousId !== newExerciseId) {
    await recordRejection(db, userId, previousId, "swappedOut");
  }
}
