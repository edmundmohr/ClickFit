import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "@/lib/auth/server";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import { setPasswordAsAdmin } from "@/features/auth/services/password-service";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

let testDb: TestDatabase;
let auth: Auth;
let adminId: string;
let annaId: string;

async function signIn(username: string, password: string): Promise<boolean> {
  try {
    const result = await auth.api.signInUsername({ body: { username, password } });
    return Boolean(result?.token);
  } catch {
    return false;
  }
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  auth = createAuth({ ...testDb.env, APP_URL: "http://localhost:3000" });
  adminId = (
    await createUserWithPassword(testDb.db, { username: "Admin", password: TEST_PASSWORDS.admin, role: "admin" })
  ).id;
  annaId = (
    await createUserWithPassword(testDb.db, { username: "Anna", password: TEST_PASSWORDS.anna, role: "user" })
  ).id;
});

afterAll(async () => {
  await testDb.dispose();
});

describe("sign-in through Better Auth", () => {
  it("accepts the seeded username and password (case-insensitive username)", async () => {
    expect(await signIn("Anna", TEST_PASSWORDS.anna)).toBe(true);
    expect(await signIn("anna", TEST_PASSWORDS.anna)).toBe(true);
  });

  it("rejects wrong passwords and unknown users", async () => {
    expect(await signIn("Anna", TEST_PASSWORDS.admin)).toBe(false);
    expect(await signIn("Nobody", TEST_PASSWORDS.anna)).toBe(false);
  });

  it("uses the new password after an admin reset", async () => {
    await setPasswordAsAdmin(
      testDb.db,
      { id: adminId, role: "admin" },
      { targetUserId: annaId, newPassword: TEST_PASSWORDS.replacement },
    );
    expect(await signIn("Anna", TEST_PASSWORDS.anna)).toBe(false);
    expect(await signIn("Anna", TEST_PASSWORDS.replacement)).toBe(true);
  });

  it("keeps public registration closed", async () => {
    const attempt = auth.api.signUpEmail({
      body: { name: "Intruder", email: "intruder@example.com", password: TEST_PASSWORDS.replacement },
    });
    await expect(attempt).rejects.toThrow();
    expect(await signIn("Intruder", TEST_PASSWORDS.replacement)).toBe(false);
  });
});
