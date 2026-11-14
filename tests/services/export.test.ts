import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTranslator } from "use-intl/core";
import { strFromU8, unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { food, workoutExercise, workoutSession, workoutSet } from "@/db/schema";
import { csvText } from "@/domain/export/csv";
import { renderPdf } from "@/domain/export/pdf";
import type { ExportDocument, ExportTable } from "@/domain/export/types";
import { renderXlsx } from "@/domain/export/xlsx";
import { EQUIPMENT } from "@/domain/exercises/types";
import { addDays, toLocalDate } from "@/lib/dates";
import { newId } from "@/lib/tokens";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import { logActivity } from "@/features/cardio/services/activity-service";
import { EXPORT_DATASETS, EXPORT_TABLES } from "@/features/export/datasets";
import {
  buildExportDocument,
  buildNutritionExport,
  buildTrainingExport,
  buildWeightExport,
  type ExportLabels,
  type ExportUser,
} from "@/features/export/services/export-service";
import { addLogEntry } from "@/features/nutrition/services/diary-service";
import { createCustomFood } from "@/features/nutrition/services/food-service";
import { saveWeight } from "@/features/nutrition/services/tracking-service";
import type { OnboardingInput } from "@/features/training/schemas";
import { getActivePlan, createPlanFromProfile } from "@/features/training/services/plan-service";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { finishWorkout, saveSet, startWorkout } from "@/features/training/services/workout-service";
import { getWorkoutView } from "@/features/training/services/workout-view";
import messages from "../../messages";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

/**
 * Für die Route: Sitzung, Datenbank und Texte kommen im Betrieb aus Next.js und Cloudflare.
 * Im Test stehen dafür der gerade „angemeldete“ Nutzer, die lokale D1 und der echte Textkatalog.
 */
const routeState = vi.hoisted(() => ({ user: null as { id: string; unitSystem: "metric" | "imperial" } | null, db: null as unknown }));
vi.mock("@/features/auth/session", () => ({ getCurrentUser: async () => routeState.user }));
vi.mock("@/lib/server/context", () => ({ getDb: () => routeState.db }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: keyof typeof messages) => createTranslator({ locale: "de", messages, namespace }),
}));

const NOW = new Date("2026-11-16T17:00:00Z");
const TODAY = toLocalDate(NOW);
const OATS = "basic:oats-rolled";

const onboarding: OnboardingInput = {
  goal: "muscle_gain",
  experience: "intermediate",
  weekdays: [1, 3, 5],
  sessionMinutes: 60,
  locationType: "gym",
  equipment: [...EQUIPMENT],
  cardio: { wanted: false, types: [], sessionsPerWeek: 0 },
  sex: "female",
  birthYear: 1992,
  heightCm: 170,
  weightKg: 65,
  activityLevel: "light",
  injuries: [],
  injuryNote: "",
  excludedExerciseIds: [],
};

/** Feste Beschriftungen: Der Dienst bekommt sie im Betrieb aus dem Textkatalog. */
function labelsFor(unit: "kg" | "lbs"): ExportLabels {
  const self = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((key) => [key, `#${key}`])) as Record<K, string>;
  return {
    titles: { training: "Training", weight: "Gewicht", nutrition: "Ernährung" },
    period: (from, to) => (from === null ? `bis ${to}` : `${from} – ${to}`),
    tables: { sets: "Sätze", sessions: "Einheiten", activities: "Cardio & Zusatzsport", weight: "Gewicht", days: "Tagessummen", entries: "Einträge" },
    columns: {
      date: "Datum",
      workout: "Training",
      exercise: "Übung",
      setNumber: "Satz-Nr.",
      setType: "Satz-Typ",
      weight: `Gewicht (${unit})`,
      reps: "Wiederholungen",
      seconds: "Sekunden",
      rir: "RIR",
      note: "Notiz",
      durationMinutes: "Dauer (min)",
      sets: "Sätze",
      volume: `Volumen (${unit})`,
      activityType: "Art",
      distanceKm: "Distanz (km)",
      heartRate: "Puls",
      zone: "Zone",
      intensity: "Anstrengung",
      bodyWeight: `Gewicht (${unit})`,
      trend: `Trend (${unit})`,
      kcal: "kcal",
      protein: "Eiweiß (g)",
      carbs: "Kohlenhydrate (g)",
      fat: "Fett (g)",
      meal: "Mahlzeit",
      food: "Lebensmittel",
      amount: "Menge",
      unit: "Einheit",
    },
    focus: (focus) => `Fokus ${focus}`,
    setTypes: { warmup: "Aufwärmsatz", work: "Arbeitssatz", failure: "Muskelversagen", drop: "Dropsatz" },
    activityTypes: {
      ...self(["cycling", "rowing", "walking", "swimming", "cross_trainer", "hiking", "football", "racket_sport"]),
      ...self(["climbing", "martial_arts", "team_sport", "skiing", "dancing", "yoga", "other"]),
      running: "Laufen",
    },
    intensities: { easy: "Leicht", moderate: "Mittel", hard: "Hart" },
    meals: { breakfast: "Frühstück", lunch: "Mittagessen", dinner: "Abendessen", snack: "Snacks" },
    amountUnits: { g: "g", ml: "ml", serving: "Portion" },
    unknownExercise: "Unbekannte Übung",
  };
}

const labels = labelsFor("kg");

let testDb: TestDatabase;
let anna: ExportUser;
let eddi: ExportUser;

function tableOf(document: ExportDocument, key: string): ExportTable {
  const table = document.tables.find((item) => item.key === key);
  if (!table) throw new Error(`table ${key} is missing`);
  return table;
}

/**
 * Trainiert die erste Übung des ersten Plantags: ein Aufwärmsatz, zwei Arbeitssätze und ein
 * angelegter, aber nicht abgehakter Satz. Das Training dauert 45 Minuten.
 */
async function trainFirstDay(userId: string, at: Date, finish = true) {
  const { db } = testDb;
  const plan = await getActivePlan(db, userId, toLocalDate(at));
  if (!plan) throw new Error("no active plan");
  const sessionId = await startWorkout(db, userId, plan.days[0].id, at);
  const view = await getWorkoutView(db, userId, sessionId);
  const exercise = view.exercises[0];
  const sets = [
    { type: "warmup" as const, weightKg: 40, reps: 10, rir: null, note: null, completed: true },
    { type: "work" as const, weightKg: 60, reps: 8, rir: 2, note: "Tempo; langsam", completed: true },
    { type: "work" as const, weightKg: 60, reps: 8, rir: 1, note: null, completed: true },
    { type: "work" as const, weightKg: 60, reps: 6, rir: 0, note: null, completed: false },
  ];
  for (const [position, set] of sets.entries()) {
    await saveSet(db, userId, { id: exercise.sets[position]?.id ?? newId(), workoutExerciseId: exercise.id, position, ...set }, at);
  }
  if (finish) await finishWorkout(db, userId, sessionId, new Date(at.getTime() + 45 * 60_000));
  return { sessionId, view, exercise };
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  routeState.db = testDb.db;
});

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.reset();
  await testDb.db.delete(food);
  const { db } = testDb;
  const annaId = (await createUserWithPassword(db, { username: "Anna", password: TEST_PASSWORDS.anna, role: "user" })).id;
  const eddiId = (await createUserWithPassword(db, { username: "Eddi", password: TEST_PASSWORDS.eddi, role: "user" })).id;
  anna = { id: annaId, unitSystem: "metric" };
  eddi = { id: eddiId, unitSystem: "metric" };
  await saveOnboarding(db, annaId, onboarding);
  await createPlanFromProfile(db, annaId, TODAY, NOW);
});

describe("training export", () => {
  it("lists completed sets, sessions and activities of the user", async () => {
    const { db } = testDb;
    const { view, exercise } = await trainFirstDay(anna.id, NOW);
    await logActivity(
      db,
      anna.id,
      { date: TODAY, type: "running", durationSeconds: 1830, distanceMeters: 5200, avgHeartRate: 150, zone: 3, intensity: "moderate", intervals: null, note: "Parkrunde" },
      NOW,
    );

    const document = await buildTrainingExport(db, anna, { from: TODAY, to: TODAY }, labels);
    expect(document.title).toBe("Training");
    expect(document.subtitle).toBe("16.11.2026 – 16.11.2026");
    expect(document.tables.map((table) => table.key)).toEqual([...EXPORT_TABLES.training]);

    const workoutTitle = view.name ?? `Fokus ${view.focus ?? "free"}`;
    const sets = tableOf(document, "sets");
    expect(sets.columns.map((column) => column.label)).toContain("Gewicht (kg)");
    expect(sets.rows).toEqual([
      { date: TODAY, workout: workoutTitle, exercise: exercise.name, setNumber: 1, setType: "Aufwärmsatz", weight: 40, reps: 10, seconds: null, rir: null, note: null },
      { date: TODAY, workout: workoutTitle, exercise: exercise.name, setNumber: 2, setType: "Arbeitssatz", weight: 60, reps: 8, seconds: null, rir: 2, note: "Tempo; langsam" },
      { date: TODAY, workout: workoutTitle, exercise: exercise.name, setNumber: 3, setType: "Arbeitssatz", weight: 60, reps: 8, seconds: null, rir: 1, note: null },
    ]);

    // Der Aufwärmsatz zählt wie in der App nicht zu Sätzen und Volumen: 2 × 60 kg × 8.
    expect(tableOf(document, "sessions").rows).toEqual([
      { date: TODAY, workout: workoutTitle, durationMinutes: 45, sets: 2, volume: 960 },
    ]);
    expect(tableOf(document, "activities").rows).toEqual([
      { date: TODAY, activityType: "Laufen", durationMinutes: 30.5, distanceKm: 5.2, heartRate: 150, zone: 3, intensity: "Mittel", note: "Parkrunde" },
    ]);
  });

  it("hides the data from other users", async () => {
    const { db } = testDb;
    await trainFirstDay(anna.id, NOW);
    await logActivity(db, anna.id, { date: TODAY, type: "yoga", durationSeconds: 1800, distanceMeters: null, avgHeartRate: null, zone: null, intensity: "easy", intervals: null, note: null }, NOW);
    const document = await buildTrainingExport(db, eddi, { from: null, to: TODAY }, labels);
    expect(document.tables.map((table) => table.rows)).toEqual([[], [], []]);
  });

  it("includes both ends of the period and skips running workouts", async () => {
    const { db } = testDb;
    const later = new Date(NOW.getTime() + 2 * 24 * 60 * 60_000);
    const [first, last] = [TODAY, toLocalDate(later)];
    await trainFirstDay(anna.id, NOW);
    await trainFirstDay(anna.id, later);
    await logActivity(db, anna.id, { date: first, type: "running", durationSeconds: 600, distanceMeters: null, avgHeartRate: null, zone: null, intensity: "easy", intervals: null, note: null }, later);
    await logActivity(db, anna.id, { date: last, type: "running", durationSeconds: 1200, distanceMeters: null, avgHeartRate: null, zone: null, intensity: "hard", intervals: null, note: null }, later);

    const datesOf = async (from: string | null, to: string) => {
      const document = await buildTrainingExport(db, anna, { from, to }, labels);
      return {
        sets: [...new Set(tableOf(document, "sets").rows.map((row) => row.date))],
        sessions: tableOf(document, "sessions").rows.map((row) => row.date),
        activities: tableOf(document, "activities").rows.map((row) => row.date),
      };
    };
    expect(await datesOf(first, first)).toEqual({ sets: [first], sessions: [first], activities: [first] });
    expect(await datesOf(last, last)).toEqual({ sets: [last], sessions: [last], activities: [last] });
    expect(await datesOf(addDays(first, 1), addDays(first, 1))).toEqual({ sets: [], sessions: [], activities: [] });
    // Ohne Anfang: alles bis zum Ende, zeitlich aufsteigend.
    expect(await datesOf(null, last)).toEqual({ sets: [first, last], sessions: [first, last], activities: [first, last] });
    expect(await datesOf(null, addDays(first, 1))).toEqual({ sets: [first], sessions: [first], activities: [first] });

    // Ein laufendes Training gehört noch nicht in den Export.
    const afterwards = new Date(later.getTime() + 24 * 60 * 60_000);
    await trainFirstDay(anna.id, afterwards, false);
    expect((await datesOf(null, toLocalDate(afterwards))).sessions).toEqual([first, last]);
  });

  it("converts weights to lbs for imperial users", async () => {
    await trainFirstDay(anna.id, NOW);
    const document = await buildTrainingExport(testDb.db, { ...anna, unitSystem: "imperial" }, { from: null, to: TODAY }, labelsFor("lbs"));
    const sets = tableOf(document, "sets");
    expect(sets.columns.find((column) => column.key === "weight")).toMatchObject({ label: "Gewicht (lbs)", decimals: 1 });
    expect(sets.rows.map((row) => row.weight)).toEqual([88.2, 132.3, 132.3]);
    expect(tableOf(document, "sessions").rows[0].volume).toBe(2116.4);
  });

  it("names custom routines and exercises missing from the catalogue", async () => {
    const { db } = testDb;
    const { sessionId, exercise } = await trainFirstDay(anna.id, NOW);
    await db.update(workoutSession).set({ name: "Mein Oberkörper" });
    await db.update(workoutExercise).set({ exerciseId: "gibt-es-nicht" });
    const document = await buildTrainingExport(db, anna, { from: null, to: TODAY }, labels);
    expect(sessionId).toBeTruthy();
    expect(exercise.name).not.toBe("Unbekannte Übung");
    expect(tableOf(document, "sets").rows[0]).toMatchObject({ workout: "Mein Oberkörper", exercise: "Unbekannte Übung" });
    expect(tableOf(document, "sessions").rows[0].workout).toBe("Mein Oberkörper");
  });

  it("exports more sessions than D1 allows bound parameters", async () => {
    const { db } = testDb;
    const count = 105;
    for (let index = 0; index < count; index++) {
      const sessionId = newId();
      const workoutExerciseId = newId();
      const startedAt = new Date(NOW.getTime() - (count - index) * 24 * 60 * 60_000);
      await db.batch([
        db.insert(workoutSession).values({
          id: sessionId,
          userId: anna.id,
          date: toLocalDate(startedAt),
          status: "completed",
          startedAt,
          finishedAt: new Date(startedAt.getTime() + 30 * 60_000),
          createdAt: startedAt,
          updatedAt: startedAt,
        }),
        db.insert(workoutExercise).values({
          id: workoutExerciseId,
          sessionId,
          userId: anna.id,
          position: 0,
          exerciseId: "gibt-es-nicht",
          repMin: 8,
          repMax: 12,
          targetRir: 2,
          restSeconds: 90,
        }),
        db.insert(workoutSet).values({ id: newId(), workoutExerciseId, position: 0, type: "work", weightKg: 50, reps: 10, completedAt: startedAt }),
      ]);
    }
    const document = await buildTrainingExport(db, anna, { from: null, to: TODAY }, labels);
    expect(tableOf(document, "sets").rows).toHaveLength(count);
    const sessions = tableOf(document, "sessions").rows;
    expect(sessions).toHaveLength(count);
    expect(sessions[0]).toMatchObject({ workout: "Fokus free", durationMinutes: 30, sets: 1, volume: 500 });
    const dates = sessions.map((row) => String(row.date));
    expect(dates).toEqual([...dates].sort());
  });
});

describe("weight export", () => {
  it("exports measurements with a trend that also knows earlier values", async () => {
    const { db } = testDb;
    await saveWeight(db, anna.id, "2026-11-01", 70);
    await saveWeight(db, anna.id, "2026-11-10", 68);
    await saveWeight(db, anna.id, "2026-11-16", 67.5);
    await saveWeight(db, eddi.id, "2026-11-16", 90);

    const all = tableOf(await buildWeightExport(db, anna, { from: null, to: TODAY }, labels), "weight");
    expect(all.rows.map((row) => [row.date, row.bodyWeight])).toEqual([
      ["2026-11-01", 70],
      ["2026-11-10", 68],
      ["2026-11-16", 67.5],
    ]);
    expect(all.rows[0].trend).toBe(70);

    // Beide Grenzen zählen mit; der Trend am 10.11. kennt die Messung vom 01.11.
    const part = tableOf(await buildWeightExport(db, anna, { from: "2026-11-10", to: "2026-11-16" }, labels), "weight");
    expect(part.rows.map((row) => row.date)).toEqual(["2026-11-10", "2026-11-16"]);
    expect(part.rows[0].trend).toBe(all.rows[1].trend);
    expect(part.rows[0].trend).toBeGreaterThan(68);
    expect(part.rows[0].trend).toBeLessThan(70);

    const single = tableOf(await buildWeightExport(db, anna, { from: "2026-11-02", to: "2026-11-15" }, labels), "weight");
    expect(single.rows.map((row) => row.date)).toEqual(["2026-11-10"]);

    expect(tableOf(await buildWeightExport(db, eddi, { from: null, to: TODAY }, labels), "weight").rows).toEqual([
      { date: "2026-11-16", bodyWeight: 90, trend: 90 },
    ]);
  });

  it("converts to lbs for imperial users", async () => {
    await saveWeight(testDb.db, anna.id, "2026-11-16", 70);
    const document = await buildWeightExport(testDb.db, { ...anna, unitSystem: "imperial" }, { from: null, to: TODAY }, labelsFor("lbs"));
    const table = tableOf(document, "weight");
    expect(table.columns.map((column) => column.label)).toEqual(["Datum", "Gewicht (lbs)", "Trend (lbs)"]);
    expect(table.rows).toEqual([{ date: "2026-11-16", bodyWeight: 154.3, trend: 154.3 }]);
  });
});

describe("nutrition export", () => {
  async function logFood() {
    const { db } = testDb;
    const formulaFood = await createCustomFood(db, anna.id, {
      name: "=SUMME(A1:A9)",
      brand: "",
      basis: "g",
      kcal: 200,
      proteinG: 10,
      carbsG: 20,
      fatG: 5,
      servingSize: null,
      servingLabel: "",
      barcode: "",
    });
    // Bewusst nicht in der Reihenfolge der Mahlzeiten eingetragen.
    await addLogEntry(db, anna.id, { date: "2026-11-15", meal: "dinner", foodRef: formulaFood, amount: 150, amountUnit: "g" });
    await addLogEntry(db, anna.id, { date: "2026-11-15", meal: "breakfast", foodRef: OATS, amount: 50, amountUnit: "g" });
    await addLogEntry(db, anna.id, { date: "2026-11-16", meal: "breakfast", foodRef: OATS, amount: 1, amountUnit: "serving" });
    await addLogEntry(db, eddi.id, { date: "2026-11-16", meal: "snack", foodRef: OATS, amount: 100, amountUnit: "g" });
  }

  it("exports daily totals and entries in meal order", async () => {
    await logFood();
    const document = await buildNutritionExport(testDb.db, anna, { from: "2026-11-15", to: "2026-11-16" }, labels);
    expect(document.tables.map((table) => table.key)).toEqual([...EXPORT_TABLES.nutrition]);

    expect(tableOf(document, "entries").rows).toEqual([
      { date: "2026-11-15", meal: "Frühstück", food: "Haferflocken", amount: 50, unit: "g", kcal: 186, protein: 6.8, carbs: 29.4, fat: 3.5 },
      { date: "2026-11-15", meal: "Abendessen", food: "=SUMME(A1:A9)", amount: 150, unit: "g", kcal: 300, protein: 15, carbs: 30, fat: 7.5 },
      { date: "2026-11-16", meal: "Frühstück", food: "Haferflocken", amount: 1, unit: "Portion", kcal: 186, protein: 6.8, carbs: 29.4, fat: 3.5 },
    ]);
    expect(tableOf(document, "days").rows).toEqual([
      { date: "2026-11-15", kcal: 486, protein: 21.8, carbs: 59.4, fat: 11 },
      { date: "2026-11-16", kcal: 186, protein: 6.8, carbs: 29.4, fat: 3.5 },
    ]);
  });

  it("respects the period and the owner", async () => {
    await logFood();
    const { db } = testDb;
    const day = tableOf(await buildNutritionExport(db, anna, { from: "2026-11-16", to: "2026-11-16" }, labels), "entries");
    expect(day.rows.map((row) => row.date)).toEqual(["2026-11-16"]);
    const before = await buildNutritionExport(db, anna, { from: null, to: "2026-11-14" }, labels);
    expect(before.tables.map((table) => table.rows)).toEqual([[], []]);
    expect(before.subtitle).toBe("bis 14.11.2026");
    const other = tableOf(await buildNutritionExport(db, eddi, { from: null, to: TODAY }, labels), "entries");
    expect(other.rows).toEqual([
      { date: "2026-11-16", meal: "Snacks", food: "Haferflocken", amount: 100, unit: "g", kcal: 372, protein: 13.5, carbs: 58.7, fat: 7 },
    ]);
  });

  it("stays harmless when a food name looks like a formula", async () => {
    await logFood();
    const document = await buildNutritionExport(testDb.db, anna, { from: null, to: TODAY }, labels);
    expect(csvText(tableOf(document, "entries"))).toContain("15.11.2026;Abendessen;'=SUMME(A1:A9);150;g;300;15,0;30,0;7,5\r\n");
    const sheet = strFromU8(unzipSync(renderXlsx(document))["xl/worksheets/sheet2.xml"]);
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=SUMME(A1:A9)</t></is></c>');
    expect(sheet).not.toContain("<f>");
  });
});

describe("all datasets", () => {
  it("builds every dataset and renders it in every format", async () => {
    const { db } = testDb;
    await trainFirstDay(anna.id, NOW);
    await saveWeight(db, anna.id, TODAY, 66.4);
    await addLogEntry(db, anna.id, { date: TODAY, meal: "lunch", foodRef: OATS, amount: 80, amountUnit: "g" });
    for (const dataset of EXPORT_DATASETS) {
      const document = await buildExportDocument(db, anna, dataset, { from: addDays(TODAY, -29), to: TODAY }, labels);
      expect(document.tables.map((table) => table.key)).toEqual([...EXPORT_TABLES[dataset]]);
      expect(document.tables[0].rows.length).toBeGreaterThan(0);
      expect(csvText(document.tables[0]).split("\r\n").length).toBeGreaterThan(2);
      expect(Object.keys(unzipSync(renderXlsx(document)))).toContain(`xl/worksheets/sheet${document.tables.length}.xml`);
      const pdf = await PDFDocument.load(
        await renderPdf(document, { labels: { created: "Erstellt", empty: "Keine Daten", page: (current, total) => `${current}/${total}` } }),
      );
      expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("export route", () => {
  async function request(dataset: string, query: string): Promise<Response> {
    const { GET } = await import("@/app/api/export/[dataset]/route");
    return GET(new Request(`http://localhost/api/export/${dataset}?${query}`), { params: Promise.resolve({ dataset }) });
  }

  beforeEach(async () => {
    routeState.user = anna;
    await saveWeight(testDb.db, anna.id, "2026-11-10", 68);
    await saveWeight(testDb.db, anna.id, "2026-11-16", 67.5);
    await addLogEntry(testDb.db, anna.id, { date: "2026-11-16", meal: "lunch", foodRef: OATS, amount: 80, amountUnit: "g" });
  });

  it("requires a session, a known dataset and valid parameters", async () => {
    routeState.user = null;
    expect((await request("weight", "format=csv")).status).toBe(401);
    routeState.user = anna;
    expect((await request("steps", "format=csv")).status).toBe(404);
    for (const query of [
      "",
      "format=docx",
      "format=csv&from=16.11.2026",
      "format=csv&from=2026-02-30",
      "format=csv&from=2026-11-17&to=2026-11-16",
      "format=csv&table=entries",
      "format=pdf&to=heute",
    ]) {
      expect((await request("weight", query)).status, query).toBe(400);
    }
  });

  it("sends a CSV download with safe headers", async () => {
    const response = await request("weight", "format=csv&from=2026-11-01&to=2026-11-16");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="clickfit-gewicht-2026-11-01-2026-11-16.csv"');
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(response.headers.get("Content-Length")).toBe(String(bytes.byteLength));
    const lines = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes).split("\r\n");
    expect(lines[0]).toBe("\u{FEFF}Datum;Gewicht (kg);Trend (kg)");
    expect(lines[1]).toBe("10.11.2026;68,00;68,00");
    expect(lines).toHaveLength(4);
  });

  it("exports only the data of the signed-in user", async () => {
    routeState.user = eddi;
    const text = await (await request("weight", "format=csv")).text();
    expect(text.trim().split("\r\n")).toHaveLength(1);
  });

  it("sends Excel with all tables and CSV with the chosen one", async () => {
    const xlsx = await request("nutrition", "format=xlsx&to=2026-11-16");
    expect(xlsx.headers.get("Content-Type")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    expect(xlsx.headers.get("Content-Disposition")).toBe('attachment; filename="clickfit-ernaehrung-gesamt-2026-11-16.xlsx"');
    const workbook = strFromU8(unzipSync(new Uint8Array(await xlsx.arrayBuffer()))["xl/workbook.xml"]);
    expect(workbook).toContain('name="Tagessummen"');
    expect(workbook).toContain('name="Einträge"');

    const csv = await request("nutrition", "format=csv&table=entries&from=2026-11-16&to=2026-11-16");
    expect(csv.headers.get("Content-Disposition")).toBe('attachment; filename="clickfit-ernaehrung-eintraege-2026-11-16-2026-11-16.csv"');
    expect(await csv.text()).toContain("16.11.2026;Mittagessen;Haferflocken;80;g;298;10,8;47,0;5,6\r\n");
    const firstTable = await request("nutrition", "format=csv&to=2026-11-16");
    expect(await firstTable.text()).toContain("Datum;kcal;Eiweiß (g);Kohlenhydrate (g);Fett (g)\r\n16.11.2026;298;10,8;47,0;5,6\r\n");
  });

  it("sends a PDF with the unit of the user in the headers", async () => {
    routeState.user = { ...anna, unitSystem: "imperial" };
    const response = await request("training", "format=pdf&from=2026-11-01&to=2026-11-16");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="clickfit-training-2026-11-01-2026-11-16.pdf"');
    const pdf = await PDFDocument.load(await response.arrayBuffer());
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("ClickFit – Training");
  });
});
