import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { activity, apiToken, bodyWeightEntry, healthMetric } from "@/db/schema";
import { EQUIPMENT } from "@/domain/exercises/types";
import { parseCsv } from "@/domain/health-import/csv";
import { emptyHealthImport, type HealthImport } from "@/domain/health-import/types";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import { getActivityLoads, listActivities } from "@/features/cardio/services/activity-service";
import {
  CSV_MAX_FILE_BYTES,
  CSV_MAX_REQUEST_BYTES,
  MAX_TOKENS_PER_USER,
  csvRequestBytes,
} from "@/features/integrations/constants";
import { applyHealthImport, getHealthMetrics } from "@/features/integrations/services/import-service";
import {
  authenticateToken,
  createToken,
  deleteToken,
  hashToken,
  listTokens,
} from "@/features/integrations/services/token-service";
import { getWeights, saveWeight } from "@/features/nutrition/services/tracking-service";
import type { OnboardingInput } from "@/features/training/schemas";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { addDays, toLocalDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

/** Für die Route: Die Datenbank kommt im Betrieb aus Cloudflare, im Test ist es die lokale D1. */
const routeState = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/server/context", () => ({ getDb: () => routeState.db }));

const NOW = new Date("2026-11-14T19:00:00Z");
const TODAY = toLocalDate(NOW);
const YESTERDAY = addDays(TODAY, -1);

/** Jahrgang 1990: Maximalpuls 183, Zone 4 ab 146 Schlägen. */
const onboarding: OnboardingInput = {
  goal: "muscle_gain",
  experience: "intermediate",
  weekdays: [1, 3, 5],
  sessionMinutes: 60,
  locationType: "gym",
  equipment: [...EQUIPMENT],
  cardio: { wanted: false, types: [], sessionsPerWeek: 0 },
  sex: "male",
  birthYear: 1990,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "light",
  injuries: [],
  injuryNote: "",
  excludedExerciseIds: [],
};

let testDb: TestDatabase;
let annaId: string;
let eddiId: string;

const data = (partial: Partial<HealthImport>): HealthImport => ({ ...emptyHealthImport(), ...partial });

const run: HealthImport["workouts"][number] = {
  externalId: "run-1",
  type: "running",
  start: new Date("2026-11-13T17:00:00Z"),
  durationSeconds: 2700,
  distanceMeters: 7500,
  avgHeartRate: 150,
};

beforeAll(async () => {
  testDb = await createTestDatabase();
  routeState.db = testDb.db;
});

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.reset();
  const { db } = testDb;
  annaId = (await createUserWithPassword(db, { username: "Anna", password: TEST_PASSWORDS.anna, role: "user" })).id;
  eddiId = (await createUserWithPassword(db, { username: "Eddi", password: TEST_PASSWORDS.eddi, role: "user" })).id;
  await saveOnboarding(db, annaId, onboarding);
});

describe("api tokens", () => {
  it("creates a token, shows it once and stores only its hash", async () => {
    const { db } = testDb;
    const created = await createToken(db, annaId, "  iPhone  ", NOW);
    expect(created.token).toMatch(/^cf_[A-Za-z0-9_-]{40}$/);
    expect(created).toMatchObject({ name: "iPhone", prefix: created.token.slice(0, 11), createdAt: NOW, lastUsedAt: null });

    const [row] = await db.select().from(apiToken);
    expect(row.tokenHash).toBe(await hashToken(created.token));
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(row)).not.toContain(created.token);

    const listed = await listTokens(db, annaId);
    expect(listed).toEqual([{ id: created.id, name: "iPhone", prefix: created.prefix, createdAt: NOW, lastUsedAt: null }]);
    expect(await listTokens(db, eddiId)).toEqual([]);
  });

  it("creates different tokens each time and lists the newest first", async () => {
    const { db } = testDb;
    const first = await createToken(db, annaId, "Waage", NOW);
    const second = await createToken(db, annaId, "iPhone", new Date(NOW.getTime() + 1000));
    expect(first.token).not.toBe(second.token);
    expect((await listTokens(db, annaId)).map((token) => token.name)).toEqual(["iPhone", "Waage"]);
  });

  it("authenticates a token and updates the last use at most once per minute", async () => {
    const { db } = testDb;
    const { token, id } = await createToken(db, annaId, "iPhone", NOW);
    const lastUsed = async () => (await db.query.apiToken.findFirst({ where: eq(apiToken.id, id) }))?.lastUsedAt ?? null;
    const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);

    expect(await authenticateToken(db, token, at(10))).toBe(annaId);
    expect(await lastUsed()).toEqual(at(10));
    expect(await authenticateToken(db, token, at(60))).toBe(annaId);
    expect(await lastUsed()).toEqual(at(10));
    expect(await authenticateToken(db, token, at(70))).toBe(annaId);
    expect(await lastUsed()).toEqual(at(70));
  });

  it("rejects wrong and malformed tokens", async () => {
    const { db } = testDb;
    const { token } = await createToken(db, annaId, "iPhone", NOW);
    const flipped = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    for (const candidate of [flipped, "", "cf_", "cf_short", token.slice(3), `${token} `, token.toUpperCase(), "cf_" + "a".repeat(500)]) {
      expect(await authenticateToken(db, candidate, NOW), candidate).toBeNull();
    }
    const [row] = await db.select().from(apiToken);
    expect(row.lastUsedAt).toBeNull();
    // Der Hash allein öffnet nichts.
    expect(await authenticateToken(db, row.tokenHash, NOW)).toBeNull();
  });

  it("deletes own tokens only", async () => {
    const { db } = testDb;
    const anna = await createToken(db, annaId, "iPhone", NOW);
    await expect(deleteToken(db, eddiId, anna.id)).rejects.toEqual(new AppError("NOT_FOUND"));
    expect(await authenticateToken(db, anna.token, NOW)).toBe(annaId);

    await deleteToken(db, annaId, anna.id);
    expect(await authenticateToken(db, anna.token, NOW)).toBeNull();
    expect(await listTokens(db, annaId)).toEqual([]);
    await expect(deleteToken(db, annaId, anna.id)).rejects.toEqual(new AppError("NOT_FOUND"));
  });

  it("limits the number of tokens per user and validates the name", async () => {
    const { db } = testDb;
    for (let index = 0; index < MAX_TOKENS_PER_USER; index++) await createToken(db, annaId, `Token ${index}`, NOW);
    await expect(createToken(db, annaId, "zu viel", NOW)).rejects.toEqual(new AppError("TOKEN_LIMIT"));
    expect(await listTokens(db, annaId)).toHaveLength(MAX_TOKENS_PER_USER);
    // Die Grenze gilt je Nutzer.
    await expect(createToken(db, eddiId, "Waage", NOW)).resolves.toMatchObject({ name: "Waage" });

    await expect(createToken(db, eddiId, "   ", NOW)).rejects.toEqual(new AppError("VALIDATION"));
    await expect(createToken(db, eddiId, "x".repeat(41), NOW)).rejects.toEqual(new AppError("VALIDATION"));
    await expect(createToken(db, eddiId, "x".repeat(40), NOW)).resolves.toMatchObject({ name: "x".repeat(40) });
  });
});

describe("applyHealthImport", () => {
  it("writes weight, steps, resting heart rate and workouts for the user only", async () => {
    const { db } = testDb;
    const result = await applyHealthImport(
      db,
      annaId,
      data({
        weights: [{ date: YESTERDAY, kg: 81.4 }, { date: TODAY, kg: 81.2 }],
        steps: [{ date: YESTERDAY, count: 9000 }, { date: TODAY, count: 4000 }],
        restingHeartRates: [{ date: TODAY, bpm: 52 }],
        workouts: [run],
        skipped: 2,
      }),
      "api",
      NOW,
    );
    expect(result).toEqual({ imported: { weight: 2, steps: 2, restingHeartRate: 1, workouts: 1 }, skipped: 2 });

    expect(await getWeights(db, annaId, YESTERDAY, TODAY)).toEqual([
      { date: YESTERDAY, weightKg: 81.4 },
      { date: TODAY, weightKg: 81.2 },
    ]);
    const weightRows = await db.select().from(bodyWeightEntry).where(eq(bodyWeightEntry.userId, annaId));
    expect(weightRows.map((row) => row.source)).toEqual(["import", "import"]);

    expect(await getHealthMetrics(db, annaId, "steps", YESTERDAY, TODAY)).toEqual([
      { date: YESTERDAY, value: 9000 },
      { date: TODAY, value: 4000 },
    ]);
    expect(await getHealthMetrics(db, annaId, "steps", TODAY, TODAY)).toEqual([{ date: TODAY, value: 4000 }]);
    expect(await getHealthMetrics(db, annaId, "resting_heart_rate", YESTERDAY, TODAY)).toEqual([{ date: TODAY, value: 52 }]);
    const [metric] = await db.select().from(healthMetric).where(eq(healthMetric.type, "resting_heart_rate"));
    expect(metric).toMatchObject({ userId: annaId, source: "api", updatedAt: NOW });

    const [stored] = await db.select().from(activity).where(eq(activity.userId, annaId));
    expect(stored).toMatchObject({
      date: "2026-11-13",
      type: "running",
      durationSeconds: 2700,
      distanceMeters: 7500,
      avgHeartRate: 150,
      // Puls 150 bei Maximalpuls 183 liegt in Zone 4.
      zone: 4,
      intensity: "hard",
      source: "import",
      externalId: "run-1",
      endedAt: new Date("2026-11-13T17:45:00Z"),
      note: null,
    });
    // Die importierte Einheit zählt für die Erholung.
    const loads = await getActivityLoads(db, annaId, new Date("2026-11-13T00:00:00Z"));
    expect(loads.some((load) => load.muscle === "quads" && load.effectiveSets > 0)).toBe(true);

    // Der zweite Nutzer sieht nichts davon.
    expect(await getWeights(db, eddiId, YESTERDAY, TODAY)).toEqual([]);
    expect(await getHealthMetrics(db, eddiId, "steps", YESTERDAY, TODAY)).toEqual([]);
    expect(await getHealthMetrics(db, eddiId, "resting_heart_rate", YESTERDAY, TODAY)).toEqual([]);
    expect(await listActivities(db, eddiId, YESTERDAY, TODAY)).toEqual([]);
    expect(await getActivityLoads(db, eddiId, new Date("2026-11-13T00:00:00Z"))).toEqual([]);
  });

  it("estimates the effort as moderate without profile or heart rate", async () => {
    const { db } = testDb;
    await applyHealthImport(db, eddiId, data({ workouts: [run] }), "api", NOW);
    await applyHealthImport(db, annaId, data({ workouts: [{ ...run, avgHeartRate: null }] }), "api", NOW);
    const rows = await db.select().from(activity);
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toMatchObject({ zone: null, intensity: "moderate", externalId: "run-1" });
  });

  it("keeps a manually entered weight and replaces an imported one", async () => {
    const { db } = testDb;
    await saveWeight(db, annaId, TODAY, 80);
    await applyHealthImport(db, annaId, data({ weights: [{ date: YESTERDAY, kg: 82 }] }), "api", NOW);

    const result = await applyHealthImport(db, annaId, data({ weights: [{ date: YESTERDAY, kg: 81.5 }, { date: TODAY, kg: 79 }] }), "csv", NOW);
    expect(result).toEqual({ imported: { weight: 1, steps: 0, restingHeartRate: 0, workouts: 0 }, skipped: 1 });
    expect(await getWeights(db, annaId, YESTERDAY, TODAY)).toEqual([
      { date: YESTERDAY, weightKg: 81.5 },
      { date: TODAY, weightKg: 80 },
    ]);
    const rows = await db.select().from(bodyWeightEntry).where(eq(bodyWeightEntry.userId, annaId));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.date === TODAY)?.source).toBe("manual");
  });

  it("keeps a manual correction of an imported weight on the next import", async () => {
    const { db } = testDb;
    await applyHealthImport(db, annaId, data({ weights: [{ date: TODAY, kg: 82 }] }), "api", NOW);
    // Die Waage lag daneben: von Hand korrigiert. Der nächste Sync darf das nicht zurückdrehen.
    await saveWeight(db, annaId, TODAY, 80.5);
    await applyHealthImport(db, annaId, data({ weights: [{ date: TODAY, kg: 82 }] }), "api", NOW);
    expect(await getWeights(db, annaId, TODAY, TODAY)).toEqual([{ date: TODAY, weightKg: 80.5 }]);
  });

  it("updates a workout that is imported again instead of duplicating it", async () => {
    const { db } = testDb;
    await applyHealthImport(db, annaId, data({ workouts: [run] }), "api", NOW);
    const [first] = await db.select().from(activity);
    const again = await applyHealthImport(
      db,
      annaId,
      data({ workouts: [{ ...run, durationSeconds: 3000, distanceMeters: 8000, avgHeartRate: 120 }] }),
      "api",
      new Date(NOW.getTime() + 60_000),
    );
    expect(again.imported.workouts).toBe(1);
    const rows = await db.select().from(activity);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first.id,
      createdAt: first.createdAt,
      durationSeconds: 3000,
      distanceMeters: 8000,
      avgHeartRate: 120,
      zone: 2,
      intensity: "moderate",
      endedAt: new Date("2026-11-13T17:50:00Z"),
    });
    // Dieselbe Kennung bei einem anderen Nutzer ist eine eigene Einheit.
    await applyHealthImport(db, eddiId, data({ workouts: [run] }), "api", NOW);
    expect(await db.select().from(activity)).toHaveLength(2);
  });

  it("keeps two runs of one day from the activities CSV apart and imports the file only once", async () => {
    const { db } = testDb;
    const text = "Datum;Art;Dauer (min);Distanz (km)\r\n13.11.2026;Laufen;30;5\r\n13.11.2026;Laufen;45;7,5\r\n";
    await applyHealthImport(db, annaId, parseCsv(text, "activities", NOW).data, "csv", NOW);
    await applyHealthImport(db, annaId, parseCsv(text, "activities", NOW).data, "csv", NOW);
    const rows = await db.select().from(activity).where(eq(activity.userId, annaId));
    expect(rows.map((row) => row.durationSeconds).sort()).toEqual([1800, 2700]);
  });

  it("takes over an activity stored by an earlier version under the old identifier", async () => {
    const { db } = testDb;
    const text = "Datum;Art;Dauer (min);Distanz (km)\r\n13.11.2026;Laufen;30;5\r\n13.11.2026;Laufen;45;7,5\r\n";
    const parsed = parseCsv(text, "activities", NOW).data;
    // Frühere Version: beide Läufe unter einer Kennung verschmolzen, der letzte blieb übrig.
    const legacy = { ...parsed.workouts[1], externalId: parsed.workouts[1].legacyExternalId ?? "", legacyExternalId: undefined };
    await applyHealthImport(db, annaId, data({ workouts: [legacy] }), "csv", NOW);
    const [old] = await db.select().from(activity);
    await db.update(activity).set({ note: "eigene Notiz" }).where(eq(activity.id, old.id));

    await applyHealthImport(db, annaId, parsed, "csv", NOW);
    const rows = await db.select().from(activity).where(eq(activity.userId, annaId));
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === old.id)).toMatchObject({ durationSeconds: 2700, note: "eigene Notiz", externalId: parsed.workouts[1].externalId });
  });

  it("replaces daily values on repeated import and records the source", async () => {
    const { db } = testDb;
    await applyHealthImport(db, annaId, data({ steps: [{ date: TODAY, count: 4000 }] }), "api", NOW);
    const later = new Date(NOW.getTime() + 3_600_000);
    await applyHealthImport(db, annaId, data({ steps: [{ date: TODAY, count: 9500 }] }), "csv", later);
    const rows = await db.select().from(healthMetric).where(and(eq(healthMetric.userId, annaId), eq(healthMetric.type, "steps")));
    expect(rows).toEqual([{ userId: annaId, type: "steps", date: TODAY, value: 9500, source: "csv", updatedAt: later }]);
  });

  it("writes large imports in blocks and does nothing for an empty one", async () => {
    const { db } = testDb;
    expect(await applyHealthImport(db, annaId, data({ skipped: 3 }), "api", NOW)).toEqual({
      imported: { weight: 0, steps: 0, restingHeartRate: 0, workouts: 0 },
      skipped: 3,
    });

    const days = Array.from({ length: 400 }, (_, index) => addDays(TODAY, -index));
    const workouts = Array.from({ length: 40 }, (_, index) => ({
      ...run,
      externalId: `run-${index}`,
      start: new Date(run.start.getTime() - index * 86_400_000),
    }));
    const result = await applyHealthImport(
      db,
      annaId,
      data({
        weights: days.map((date, index) => ({ date, kg: 80 + (index % 10) / 10 })),
        steps: days.map((date, index) => ({ date, count: 5000 + index })),
        restingHeartRates: days.map((date) => ({ date, bpm: 55 })),
        workouts,
      }),
      "api",
      NOW,
    );
    expect(result).toEqual({ imported: { weight: 400, steps: 400, restingHeartRate: 400, workouts: 40 }, skipped: 0 });
    expect(await getWeights(db, annaId, addDays(TODAY, -399), TODAY)).toHaveLength(400);
    expect(await getHealthMetrics(db, annaId, "steps", addDays(TODAY, -399), TODAY)).toHaveLength(400);
    expect(await db.select().from(activity)).toHaveLength(40);
  });

  it("imports a parsed CSV file", async () => {
    const { db } = testDb;
    const csv = parseCsv("Datum;Gewicht (kg);Trend (kg)\r\n13.11.2026;81,40;81,50\r\n14.11.2026;81,20;81,45\r\n", "weight", NOW);
    const result = await applyHealthImport(db, annaId, csv.data, "csv", NOW);
    expect(result.imported.weight).toBe(2);
    expect(await getWeights(db, annaId, YESTERDAY, TODAY)).toEqual([
      { date: YESTERDAY, weightKg: 81.4 },
      { date: TODAY, weightKg: 81.2 },
    ]);
  });
});

describe("CSV upload limit", () => {
  it("measures the text as it is sent, so a file below the file limit can still be too large", () => {
    // Kurze Zeilen mit CRLF: Jeder Zeilenumbruch wird beim Senden maskiert und zählt doppelt.
    const line = "13.11.2026;81,4\r\n";
    const text = line.repeat(Math.floor(CSV_MAX_FILE_BYTES / line.length));
    expect(new TextEncoder().encode(text).length).toBeLessThanOrEqual(CSV_MAX_FILE_BYTES);
    expect(csvRequestBytes(text)).toBeGreaterThan(text.length);
    const quoted = '"13.11.2026";"81,4"\r\n'.repeat(42_000);
    expect(quoted.length).toBeLessThanOrEqual(CSV_MAX_FILE_BYTES);
    expect(csvRequestBytes(quoted)).toBeGreaterThan(CSV_MAX_REQUEST_BYTES);
  });

  it("counts umlauts in UTF-8 and stays below the 1 MB limit of server actions", () => {
    expect(csvRequestBytes("Größe")).toBe(9);
    expect(CSV_MAX_REQUEST_BYTES).toBeLessThan(1024 * 1024);
  });
});

describe("health import route", () => {
  const URL = "http://localhost/api/import/health";

  async function post(body: BodyInit | null, headers: Record<string, string> = {}): Promise<Response> {
    const { POST } = await import("@/app/api/import/health/route");
    return POST(new Request(URL, { method: "POST", body, headers: { "Content-Type": "application/json", ...headers } }));
  }

  async function authorized(): Promise<Record<string, string>> {
    const { token } = await createToken(testDb.db, annaId, "iPhone");
    return { Authorization: `Bearer ${token}` };
  }

  it("answers 401 without a token, with a wrong token or another scheme", async () => {
    const { token } = await createToken(testDb.db, annaId, "iPhone");
    const attempts: Record<string, string>[] = [
      {},
      { Authorization: "Bearer cf_" + "x".repeat(40) },
      { Authorization: `Basic ${token}` },
      { Authorization: token },
      { Authorization: "Bearer" },
      // Ein Cookie meldet niemanden an.
      { Cookie: `token=${token}` },
    ];
    for (const headers of attempts) {
      const response = await post(JSON.stringify({ weight: 81.2 }), headers);
      expect(response.status, JSON.stringify(Object.keys(headers))).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe("Bearer");
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "UNAUTHORIZED" });
    }
    expect(await testDb.db.select().from(bodyWeightEntry)).toEqual([]);
  });

  it("answers 400 for invalid JSON and unknown formats", async () => {
    const headers = await authorized();
    for (const body of ["", "kein json", "{", "[1,2]", "42", "{}", '{"gewicht":80}', '{"data":{"metrics":"x"}}']) {
      const response = await post(body, headers);
      expect(response.status, body).toBe(400);
      expect(await response.json()).toMatchObject({ error: "IMPORT_INVALID" });
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    const tooMany = await post(JSON.stringify({ steps: Array.from({ length: 5001 }, () => 1) }), headers);
    expect(tooMany.status).toBe(400);
    expect(await tooMany.json()).toEqual({ error: "IMPORT_INVALID", reason: "too_many_entries" });
    expect(await testDb.db.select().from(healthMetric)).toEqual([]);
  });

  it("answers 413 for a body that is too large", async () => {
    const headers = await authorized();
    const declared = await post(JSON.stringify({ weight: 81.2 }), { ...headers, "Content-Length": String(2 * 1024 * 1024 + 1) });
    expect(declared.status).toBe(413);

    // Ohne ehrliche Längenangabe greift die Grenze beim Lesen.
    const huge = JSON.stringify({ weight: 81.2, padding: "x".repeat(2 * 1024 * 1024) });
    const streamed = await post(huge, headers);
    expect(streamed.status).toBe(413);
    expect(streamed.headers.get("Cache-Control")).toBe("no-store");
    expect(await testDb.db.select().from(bodyWeightEntry)).toEqual([]);

    // Knapp unter der Grenze geht es durch.
    const fits = await post(JSON.stringify({ weight: 81.2, padding: "x".repeat(2 * 1024 * 1024 - 100) }), headers);
    expect(fits.status).toBe(200);
  });

  it("imports the simple format and reports counters", async () => {
    const headers = await authorized();
    const response = await post(JSON.stringify({ weight: 81.2, steps: [{ count: 4000 }, { count: -5 }], restingHeartRate: { bpm: 52 } }), headers);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ imported: { weight: 1, steps: 1, restingHeartRate: 1, workouts: 0 }, skipped: 1 });

    const today = toLocalDate(new Date());
    expect(await getWeights(testDb.db, annaId, today, today)).toEqual([{ date: today, weightKg: 81.2 }]);
    expect(await getHealthMetrics(testDb.db, annaId, "steps", today, today)).toEqual([{ date: today, value: 4000 }]);
    expect(await getWeights(testDb.db, eddiId, today, today)).toEqual([]);
    const [token] = await listTokens(testDb.db, annaId);
    expect(token.lastUsedAt).not.toBeNull();
  });

  it("imports the Health Auto Export format", async () => {
    const headers = await authorized();
    const start = new Date(Date.now() - 3 * 3_600_000);
    const end = new Date(start.getTime() + 45 * 60_000);
    const payload = {
      data: {
        metrics: [
          { name: "weight_body_mass", units: "lb", data: [{ date: start.toISOString(), qty: 179 }] },
          { name: "step_count", units: "count", data: [{ date: start.toISOString(), qty: 2500 }, { date: start.toISOString(), qty: 1500 }] },
          { name: "resting_heart_rate", units: "count/min", data: [{ date: start.toISOString(), qty: 51 }] },
          { name: "active_energy", units: "kJ", data: [{ date: start.toISOString(), qty: 900 }] },
        ],
        workouts: [
          { id: "A1", name: "Running", start: start.toISOString(), end: end.toISOString(), distance: { qty: 5, units: "km" }, avgHeartRate: { qty: 150 } },
          { id: "A2", name: "Traditional Strength Training", start: start.toISOString(), end: end.toISOString() },
        ],
      },
    };
    const first = await post(JSON.stringify(payload), headers);
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ imported: { weight: 1, steps: 1, restingHeartRate: 1, workouts: 1 }, skipped: 1 });

    // Dieselbe Anfrage noch einmal verdoppelt nichts.
    const second = await post(JSON.stringify(payload), headers);
    expect(second.status).toBe(200);
    const day = toLocalDate(start);
    expect(await getWeights(testDb.db, annaId, day, day)).toEqual([{ date: day, weightKg: 81.19 }]);
    expect(await getHealthMetrics(testDb.db, annaId, "steps", day, day)).toEqual([{ date: day, value: 4000 }]);
    const activities = await testDb.db.select().from(activity);
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ userId: annaId, type: "running", externalId: "A1", durationSeconds: 2700, distanceMeters: 5000, source: "import" });
  });
});
