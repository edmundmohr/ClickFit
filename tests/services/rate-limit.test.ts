import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuth, type Auth } from "@/lib/auth/server";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const APP_URL = "http://localhost:3000";
const MAX_ATTEMPTS = 5;

let testDb: TestDatabase;
let auth: Auth;

function signInRequest(ip: string, password: string): Promise<Response> {
  return auth.handler(
    new Request(`${APP_URL}/api/auth/sign-in/username`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: APP_URL,
        "cf-connecting-ip": ip,
      },
      body: JSON.stringify({ username: "Anna", password }),
    }),
  );
}

beforeAll(async () => {
  testDb = await createTestDatabase();
  auth = createAuth({ ...testDb.env, APP_URL });
  await createUserWithPassword(testDb.db, { username: "Anna", password: TEST_PASSWORDS.anna, role: "user" });
});

afterAll(async () => {
  await testDb.dispose();
});

describe("login rate limit", () => {
  it("blocks further attempts from the same IP after too many tries", async () => {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const response = await signInRequest("203.0.113.7", "wrong-password");
      expect(response.status).toBe(401);
    }
    const blocked = await signInRequest("203.0.113.7", TEST_PASSWORDS.anna);
    expect(blocked.status).toBe(429);
  });

  it("does not block other IP addresses", async () => {
    const response = await signInRequest("203.0.113.99", TEST_PASSWORDS.anna);
    expect(response.status).toBe(200);
  });

  it("rejects sign-in requests from a foreign origin", async () => {
    const response = await auth.handler(
      new Request(`${APP_URL}/api/auth/sign-in/username`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://evil.example",
          cookie: "session=anything",
          "cf-connecting-ip": "203.0.113.50",
        },
        body: JSON.stringify({ username: "Anna", password: TEST_PASSWORDS.anna }),
      }),
    );
    expect(response.status).toBe(403);
  });
});
