import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MOBILITY_ROUTINES } from "@/data/mobility";
import { mobilityLog } from "@/db/schema";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import {
  deleteLog,
  getLastDoneByRoutine,
  getMobilityStreak,
  listLogs,
  logRoutine,
} from "@/features/mobility/services/mobility-service";
import { addDays } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const TODAY = "2026-11-16";
const [FIRST, SECOND] = MOBILITY_ROUTINES.map((routine) => routine.id);

let testDb: TestDatabase;
let annaId: string;
let eddiId: string;

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.reset();
  const { db } = testDb;
  annaId = (await createUserWithPassword(db, { username: "Anna", password: TEST_PASSWORDS.anna, role: "user" })).id;
  eddiId = (await createUserWithPassword(db, { username: "Eddi", password: TEST_PASSWORDS.eddi, role: "user" })).id;
});

describe("logRoutine", () => {
  it("stores a completed routine and returns the entry", async () => {
    const { db } = testDb;
    const entry = await logRoutine(db, annaId, { routineId: FIRST, date: TODAY, durationSeconds: 290 });
    expect(entry).toMatchObject({ routineId: FIRST, date: TODAY, durationSeconds: 290 });
    expect(entry.completedAt).toBeInstanceOf(Date);

    const logs = await listLogs(db, annaId, TODAY, TODAY);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ id: entry.id, routineId: FIRST, date: TODAY, durationSeconds: 290 });
    expect(logs[0].completedAt.getTime()).toBe(entry.completedAt.getTime());
  });

  it("rejects an unknown routine without writing anything", async () => {
    const { db } = testDb;
    await expectAppError(logRoutine(db, annaId, { routineId: "does-not-exist", date: TODAY, durationSeconds: 60 }), "NOT_FOUND");
    expect(await db.select().from(mobilityLog)).toEqual([]);
  });

  it("allows the same routine several times a day", async () => {
    const { db } = testDb;
    await logRoutine(db, annaId, { routineId: FIRST, date: TODAY, durationSeconds: 100 });
    await logRoutine(db, annaId, { routineId: FIRST, date: TODAY, durationSeconds: 200 });
    expect(await listLogs(db, annaId, TODAY, TODAY)).toHaveLength(2);
  });
});

describe("listLogs", () => {
  it("returns only the user's entries within the range, newest day first", async () => {
    const { db } = testDb;
    await logRoutine(db, annaId, { routineId: FIRST, date: addDays(TODAY, -8), durationSeconds: 100 });
    await logRoutine(db, annaId, { routineId: FIRST, date: addDays(TODAY, -7), durationSeconds: 110 });
    await logRoutine(db, annaId, { routineId: SECOND, date: addDays(TODAY, -2), durationSeconds: 120 });
    await logRoutine(db, annaId, { routineId: FIRST, date: TODAY, durationSeconds: 130 });
    await logRoutine(db, annaId, { routineId: FIRST, date: addDays(TODAY, 1), durationSeconds: 140 });
    await logRoutine(db, eddiId, { routineId: FIRST, date: TODAY, durationSeconds: 999 });

    const logs = await listLogs(db, annaId, addDays(TODAY, -7), TODAY);
    expect(logs.map((log) => log.durationSeconds)).toEqual([130, 120, 110]);
    expect(await listLogs(db, annaId, addDays(TODAY, -30), addDays(TODAY, -20))).toEqual([]);
  });
});

describe("getLastDoneByRoutine", () => {
  it("reports the latest date per routine for the user only", async () => {
    const { db } = testDb;
    await logRoutine(db, annaId, { routineId: FIRST, date: addDays(TODAY, -5), durationSeconds: 100 });
    await logRoutine(db, annaId, { routineId: FIRST, date: addDays(TODAY, -1), durationSeconds: 100 });
    await logRoutine(db, annaId, { routineId: FIRST, date: addDays(TODAY, -3), durationSeconds: 100 });
    await logRoutine(db, annaId, { routineId: SECOND, date: addDays(TODAY, -9), durationSeconds: 100 });
    await logRoutine(db, eddiId, { routineId: SECOND, date: TODAY, durationSeconds: 100 });

    const last = await getLastDoneByRoutine(db, annaId);
    expect([...last.entries()].sort()).toEqual(
      [
        [FIRST, addDays(TODAY, -1)],
        [SECOND, addDays(TODAY, -9)],
      ].sort(),
    );
    expect((await getLastDoneByRoutine(db, eddiId)).get(SECOND)).toBe(TODAY);
  });

  it("is empty without entries", async () => {
    expect((await getLastDoneByRoutine(testDb.db, annaId)).size).toBe(0);
  });
});

describe("getMobilityStreak", () => {
  it("counts consecutive days and tolerates an open today", async () => {
    const { db } = testDb;
    expect(await getMobilityStreak(db, annaId, TODAY)).toBe(0);

    await logRoutine(db, annaId, { routineId: FIRST, date: addDays(TODAY, -2), durationSeconds: 100 });
    await logRoutine(db, annaId, { routineId: FIRST, date: addDays(TODAY, -1), durationSeconds: 100 });
    await logRoutine(db, annaId, { routineId: SECOND, date: addDays(TODAY, -1), durationSeconds: 100 });
    expect(await getMobilityStreak(db, annaId, TODAY)).toBe(2);

    await logRoutine(db, annaId, { routineId: FIRST, date: TODAY, durationSeconds: 100 });
    expect(await getMobilityStreak(db, annaId, TODAY)).toBe(3);
    // Zwei Tage später ohne Eintrag ist die Serie gerissen.
    expect(await getMobilityStreak(db, annaId, addDays(TODAY, 2))).toBe(0);
  });

  it("stops at a gap and ignores other users", async () => {
    const { db } = testDb;
    await logRoutine(db, annaId, { routineId: FIRST, date: TODAY, durationSeconds: 100 });
    await logRoutine(db, annaId, { routineId: FIRST, date: addDays(TODAY, -2), durationSeconds: 100 });
    await logRoutine(db, eddiId, { routineId: FIRST, date: addDays(TODAY, -1), durationSeconds: 100 });
    expect(await getMobilityStreak(db, annaId, TODAY)).toBe(1);
    expect(await getMobilityStreak(db, eddiId, TODAY)).toBe(1);
  });
});

describe("deleteLog", () => {
  it("deletes an own entry", async () => {
    const { db } = testDb;
    const keep = await logRoutine(db, annaId, { routineId: FIRST, date: TODAY, durationSeconds: 100 });
    const remove = await logRoutine(db, annaId, { routineId: SECOND, date: TODAY, durationSeconds: 200 });
    await deleteLog(db, annaId, remove.id);
    expect((await listLogs(db, annaId, TODAY, TODAY)).map((log) => log.id)).toEqual([keep.id]);
  });

  it("does not delete entries of other users or unknown entries", async () => {
    const { db } = testDb;
    const entry = await logRoutine(db, annaId, { routineId: FIRST, date: TODAY, durationSeconds: 100 });
    await expectAppError(deleteLog(db, eddiId, entry.id), "NOT_FOUND");
    await expectAppError(deleteLog(db, annaId, "missing"), "NOT_FOUND");
    expect(await listLogs(db, annaId, TODAY, TODAY)).toHaveLength(1);
  });
});
