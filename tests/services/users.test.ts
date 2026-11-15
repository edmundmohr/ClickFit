import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { account, aiReview, aiUsage, apiToken, bodyWeightEntry, progressPhoto, session, user } from "@/db/schema";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/domain/permissions/user-management";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import {
  changeOwnPassword,
  setPasswordAsAdmin,
  verifyUserPassword,
} from "@/features/auth/services/password-service";
import {
  exportOwnData,
  listUsers,
  updateDisplayName,
  updatePreferences,
} from "@/features/users/services/account-service";
import {
  createUserAsAdmin,
  deleteUserAsAdmin,
  updateUserAsAdmin,
} from "@/features/users/services/user-admin-service";
import { uploadPhoto } from "@/features/progress/services/photo-service";
import { newId } from "@/lib/tokens";
import { PASSWORD_CHECK_LIMIT } from "@/lib/auth/attempt-limit";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

let testDb: TestDatabase;
let admin: Actor;
let anna: Actor;

async function addSession(userId: string, token: string): Promise<void> {
  const now = new Date();
  await testDb.db.insert(session).values({
    id: newId(),
    token,
    userId,
    expiresAt: new Date(now.getTime() + 60_000),
    createdAt: now,
    updatedAt: now,
  });
}

async function sessionTokens(userId: string): Promise<string[]> {
  const rows = await testDb.db.query.session.findMany({ where: eq(session.userId, userId) });
  return rows.map((row) => row.token).sort();
}

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
  admin = {
    id: (await createUserWithPassword(db, { username: "Admin", password: TEST_PASSWORDS.admin, role: "admin" })).id,
    role: "admin",
  };
  anna = {
    id: (await createUserWithPassword(db, { username: "Anna", password: TEST_PASSWORDS.anna, role: "user" })).id,
    role: "user",
  };
});

describe("user creation", () => {
  it("stores a verifiable password hash", async () => {
    expect(await verifyUserPassword(testDb.db, anna.id, TEST_PASSWORDS.anna)).toBe(true);
    expect(await verifyUserPassword(testDb.db, anna.id, TEST_PASSWORDS.admin)).toBe(false);
  });

  it("rejects duplicate usernames regardless of case", async () => {
    await expectAppError(
      createUserWithPassword(testDb.db, { username: "ANNA", password: TEST_PASSWORDS.eddi, role: "user" }),
      "USERNAME_TAKEN",
    );
  });

  it("rejects passwords that are too short", async () => {
    await expectAppError(
      createUserWithPassword(testDb.db, { username: "Eddi", password: "short", role: "user" }),
      "PASSWORD_TOO_SHORT",
    );
  });
});

describe("changing the own password", () => {
  it("requires the current password", async () => {
    await expectAppError(
      changeOwnPassword(testDb.db, {
        userId: anna.id,
        currentPassword: "not-the-password",
        newPassword: TEST_PASSWORDS.replacement,
        keepSessionToken: "current",
      }),
      "WRONG_PASSWORD",
    );
    expect(await verifyUserPassword(testDb.db, anna.id, TEST_PASSWORDS.anna)).toBe(true);
  });

  it("sets the new password and signs out other devices only", async () => {
    await addSession(anna.id, "current");
    await addSession(anna.id, "other-device");
    await addSession(admin.id, "admin-session");

    await changeOwnPassword(testDb.db, {
      userId: anna.id,
      currentPassword: TEST_PASSWORDS.anna,
      newPassword: TEST_PASSWORDS.replacement,
      keepSessionToken: "current",
    });

    expect(await verifyUserPassword(testDb.db, anna.id, TEST_PASSWORDS.replacement)).toBe(true);
    expect(await verifyUserPassword(testDb.db, anna.id, TEST_PASSWORDS.anna)).toBe(false);
    expect(await sessionTokens(anna.id)).toEqual(["current"]);
    expect(await sessionTokens(admin.id)).toEqual(["admin-session"]);
  });

  it("limits guessing the current password and counts only until the next success", async () => {
    const attempt = (currentPassword: string, now: Date) =>
      changeOwnPassword(
        testDb.db,
        { userId: anna.id, currentPassword, newPassword: TEST_PASSWORDS.replacement, keepSessionToken: "current" },
        now,
      );
    const start = new Date("2026-11-14T10:00:00Z");
    for (let index = 0; index < PASSWORD_CHECK_LIMIT.max; index++) await expectAppError(attempt("falsch", start), "WRONG_PASSWORD");
    // Auch das richtige Passwort hilft im laufenden Fenster nicht mehr.
    await expectAppError(attempt(TEST_PASSWORDS.anna, start), "TOO_MANY_REQUESTS");
    expect(await verifyUserPassword(testDb.db, anna.id, TEST_PASSWORDS.anna)).toBe(true);

    const later = new Date(start.getTime() + PASSWORD_CHECK_LIMIT.windowMs);
    await expectAppError(attempt("falsch", later), "WRONG_PASSWORD");
    await attempt(TEST_PASSWORDS.anna, later);
    expect(await verifyUserPassword(testDb.db, anna.id, TEST_PASSWORDS.replacement)).toBe(true);
  });

  it("rejects a new password that is too short", async () => {
    await expectAppError(
      changeOwnPassword(testDb.db, {
        userId: anna.id,
        currentPassword: TEST_PASSWORDS.anna,
        newPassword: "short",
        keepSessionToken: "current",
      }),
      "PASSWORD_TOO_SHORT",
    );
  });
});

describe("admin sets a password", () => {
  it("lets the admin set another user's password and signs that user out", async () => {
    await addSession(anna.id, "anna-phone");
    await setPasswordAsAdmin(testDb.db, admin, {
      targetUserId: anna.id,
      newPassword: TEST_PASSWORDS.replacement,
    });
    expect(await verifyUserPassword(testDb.db, anna.id, TEST_PASSWORDS.replacement)).toBe(true);
    expect(await sessionTokens(anna.id)).toEqual([]);
  });

  it("denies normal users", async () => {
    await expectAppError(
      setPasswordAsAdmin(testDb.db, anna, { targetUserId: admin.id, newPassword: TEST_PASSWORDS.replacement }),
      "NOT_ADMIN",
    );
    expect(await verifyUserPassword(testDb.db, admin.id, TEST_PASSWORDS.admin)).toBe(true);
  });

  it("does not allow the admin to bypass the current-password check for themselves", async () => {
    await expectAppError(
      setPasswordAsAdmin(testDb.db, admin, { targetUserId: admin.id, newPassword: TEST_PASSWORDS.replacement }),
      "SELF_NOT_ALLOWED",
    );
  });

  it("reports unknown users", async () => {
    await expectAppError(
      setPasswordAsAdmin(testDb.db, admin, { targetUserId: "missing", newPassword: TEST_PASSWORDS.replacement }),
      "NOT_FOUND",
    );
  });
});

describe("user list, profile and export", () => {
  it("lists users for admins only", async () => {
    const users = await listUsers(testDb.db, admin);
    expect(users.map((entry) => entry.username)).toEqual(["Admin", "Anna"]);
    await expectAppError(listUsers(testDb.db, anna), "NOT_ADMIN");
  });

  it("updates display name and preferences of the own account only", async () => {
    await updateDisplayName(testDb.db, anna.id, "  Anna M.  ");
    await updatePreferences(testDb.db, anna.id, { theme: "dark", unitSystem: "imperial" });

    const annaExport = await exportOwnData(testDb.db, anna.id);
    expect(annaExport.profile).toMatchObject({
      username: "Anna",
      name: "Anna M.",
      theme: "dark",
      unitSystem: "imperial",
    });
    const adminExport = await exportOwnData(testDb.db, admin.id);
    expect(adminExport.profile).toMatchObject({ name: "Admin", theme: "system", unitSystem: "metric" });
  });

  it("exports the stored data of the user and nothing of others", async () => {
    const now = new Date();
    await testDb.db.insert(bodyWeightEntry).values([
      { id: newId(), userId: anna.id, date: "2026-11-10", weightKg: 64.5, source: "manual", createdAt: now },
      { id: newId(), userId: admin.id, date: "2026-11-10", weightKg: 90, source: "manual", createdAt: now },
    ]);
    await testDb.db.insert(apiToken).values({
      id: newId(),
      userId: anna.id,
      name: "Waage",
      tokenHash: "geheimer-hash",
      prefix: "cf_abc",
      createdAt: now,
    });
    const exported = await exportOwnData(testDb.db, anna.id);
    expect(exported.version).toBe(2);
    expect(exported.data.body.weights).toHaveLength(1);
    expect(exported.data.body.weights[0]).toMatchObject({ weightKg: 64.5 });
    expect(exported.data.app.apiTokens).toEqual([expect.objectContaining({ name: "Waage", prefix: "cf_abc" })]);
    const serialized = JSON.stringify(exported);
    expect(serialized).not.toContain("geheimer-hash");
    expect(serialized).not.toContain(admin.id);
    expect((await exportOwnData(testDb.db, admin.id)).data.body.weights[0]).toMatchObject({ weightKg: 90 });
  });

  it("exports the AI usage per day", async () => {
    await testDb.db.insert(aiUsage).values([
      { userId: anna.id, date: "2026-11-13", count: 3 },
      { userId: admin.id, date: "2026-11-13", count: 7 },
    ]);
    const exported = await exportOwnData(testDb.db, anna.id);
    expect(exported.data.app.aiUsage).toEqual([{ userId: anna.id, date: "2026-11-13", count: 3 }]);
  });

  it("exports the own AI review", async () => {
    const content = { summary: "Läuft.", answer: null, areas: [], recommendations: [], dataGaps: [] };
    await testDb.db.insert(aiReview).values([
      { userId: anna.id, question: null, content, model: "test-model", createdAt: new Date() },
      { userId: admin.id, question: "Fremd", content, model: "test-model", createdAt: new Date() },
    ]);
    const exported = await exportOwnData(testDb.db, anna.id);
    expect(exported.data.app.aiReviews).toEqual([expect.objectContaining({ userId: anna.id, content })]);
  });

  it("never includes password hashes in the export", async () => {
    const serialized = JSON.stringify(await exportOwnData(testDb.db, anna.id));
    expect(serialized).not.toContain("scrypt$");
    expect(serialized).not.toContain(TEST_PASSWORDS.anna);
  });
});

describe("admin manages users", () => {
  it("creates a user who can sign in with the given password", async () => {
    const { id } = await createUserAsAdmin(testDb.db, admin, {
      username: " Eddi ",
      name: "",
      password: TEST_PASSWORDS.eddi,
      role: "user",
    });
    expect(await verifyUserPassword(testDb.db, id, TEST_PASSWORDS.eddi)).toBe(true);
    const users = await listUsers(testDb.db, admin);
    expect(users.at(-1)).toEqual({ id, name: "Eddi", username: "Eddi", role: "user" });
  });

  it("denies creating users to normal users and rejects bad input", async () => {
    const input = { username: "Eddi", password: TEST_PASSWORDS.eddi, role: "user" as const };
    await expectAppError(createUserAsAdmin(testDb.db, anna, input), "NOT_ADMIN");
    await expectAppError(createUserAsAdmin(testDb.db, admin, { ...input, username: "Jörg" }), "USERNAME_INVALID");
    await expectAppError(createUserAsAdmin(testDb.db, admin, { ...input, username: "ab" }), "USERNAME_INVALID");
    await expectAppError(createUserAsAdmin(testDb.db, admin, { ...input, username: "anna" }), "USERNAME_TAKEN");
    await expectAppError(createUserAsAdmin(testDb.db, admin, { ...input, password: "short" }), "PASSWORD_TOO_SHORT");
    expect(await listUsers(testDb.db, admin)).toHaveLength(2);
  });

  it("changes name, username and role of another user", async () => {
    await updateUserAsAdmin(testDb.db, admin, {
      targetUserId: anna.id,
      username: "Anna.M",
      name: "Anna Maria",
      role: "admin",
    });
    const row = await testDb.db.query.user.findFirst({ where: eq(user.id, anna.id) });
    expect(row).toMatchObject({
      name: "Anna Maria",
      username: "anna.m",
      displayUsername: "Anna.M",
      email: "anna.m@users.clickfit.invalid",
      role: "admin",
    });
    // Der alte Benutzername ist wieder frei, das Passwort bleibt.
    await createUserAsAdmin(testDb.db, admin, { username: "Anna", password: TEST_PASSWORDS.eddi, role: "user" });
    expect(await verifyUserPassword(testDb.db, anna.id, TEST_PASSWORDS.anna)).toBe(true);
  });

  it("guards updates: admin only, unique and valid usernames, own role fixed", async () => {
    const base = { targetUserId: anna.id, username: "Anna", name: "Anna", role: "user" as const };
    await expectAppError(updateUserAsAdmin(testDb.db, anna, base), "NOT_ADMIN");
    await expectAppError(updateUserAsAdmin(testDb.db, admin, { ...base, username: "ADMIN" }), "USERNAME_TAKEN");
    await expectAppError(updateUserAsAdmin(testDb.db, admin, { ...base, username: "an na" }), "USERNAME_INVALID");
    await expectAppError(updateUserAsAdmin(testDb.db, admin, { ...base, targetUserId: "missing" }), "NOT_FOUND");
    await expectAppError(
      updateUserAsAdmin(testDb.db, admin, { targetUserId: admin.id, username: "Admin", name: "Admin", role: "user" }),
      "OWN_ACCOUNT_PROTECTED",
    );
    // Eigener Name und Benutzername lassen sich ändern, auch nur in der Schreibweise.
    await updateUserAsAdmin(testDb.db, admin, { targetUserId: admin.id, username: "ADMIN", name: "Chef", role: "admin" });
    expect((await listUsers(testDb.db, admin))[0]).toMatchObject({ name: "Chef", username: "ADMIN", role: "admin" });
  });

  it("deletes a user with all data, sessions and photo files", async () => {
    const bucket = testDb.env.UPLOADS;
    const now = new Date();
    await addSession(anna.id, "anna-phone");
    await testDb.db.insert(bodyWeightEntry).values([
      { id: newId(), userId: anna.id, date: "2026-11-10", weightKg: 64.5, source: "manual", createdAt: now },
      { id: newId(), userId: admin.id, date: "2026-11-10", weightKg: 90, source: "manual", createdAt: now },
    ]);
    const photo = { data: new Uint8Array([1, 2, 3]).buffer, contentType: "image/jpeg", date: "2026-11-10", note: "", sessionId: null } as const;
    const annaPhoto = await uploadPhoto(testDb.db, bucket, anna.id, photo);
    const adminPhoto = await uploadPhoto(testDb.db, bucket, admin.id, photo);

    await deleteUserAsAdmin(testDb.db, bucket, admin, anna.id);

    expect((await listUsers(testDb.db, admin)).map((entry) => entry.username)).toEqual(["Admin"]);
    expect(await sessionTokens(anna.id)).toEqual([]);
    expect(await testDb.db.query.account.findMany({ where: eq(account.userId, anna.id) })).toEqual([]);
    expect(await testDb.db.query.bodyWeightEntry.findMany()).toHaveLength(1);
    expect(await testDb.db.query.progressPhoto.findMany({ where: eq(progressPhoto.userId, anna.id) })).toEqual([]);
    expect(await bucket.head(`photos/${anna.id}/${annaPhoto}`)).toBeNull();
    expect(await bucket.head(`photos/${admin.id}/${adminPhoto}`)).not.toBeNull();
    // Der Benutzername ist danach wieder frei.
    await createUserAsAdmin(testDb.db, admin, { username: "Anna", password: TEST_PASSWORDS.anna, role: "user" });
  });

  it("guards deletion: admin only, never the own account", async () => {
    const bucket = testDb.env.UPLOADS;
    await expectAppError(deleteUserAsAdmin(testDb.db, bucket, anna, admin.id), "NOT_ADMIN");
    await expectAppError(deleteUserAsAdmin(testDb.db, bucket, admin, admin.id), "OWN_ACCOUNT_PROTECTED");
    await expectAppError(deleteUserAsAdmin(testDb.db, bucket, admin, "missing"), "NOT_FOUND");
    expect(await listUsers(testDb.db, admin)).toHaveLength(2);
  });
});
