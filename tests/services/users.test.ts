import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { session } from "@/db/schema";
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
import { newId } from "@/lib/tokens";
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

  it("never includes password hashes in the export", async () => {
    const serialized = JSON.stringify(await exportOwnData(testDb.db, anna.id));
    expect(serialized).not.toContain("scrypt$");
    expect(serialized).not.toContain(TEST_PASSWORDS.anna);
  });
});
