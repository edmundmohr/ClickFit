import { describe, expect, it } from "vitest";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  isPasswordLengthValid,
  verifyPassword,
} from "@/lib/auth/password";

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword({ hash, password: "correct horse battery" })).toBe(true);
    expect(await verifyPassword({ hash, password: "correct horse batterY" })).toBe(false);
  });

  it("never stores the plain password and salts every hash", async () => {
    const first = await hashPassword("same-password");
    const second = await hashPassword("same-password");
    expect(first).not.toContain("same-password");
    expect(first).not.toEqual(second);
    expect(first.startsWith("scrypt$")).toBe(true);
  });

  it("rejects malformed hashes instead of throwing", async () => {
    expect(await verifyPassword({ hash: "", password: "x" })).toBe(false);
    expect(await verifyPassword({ hash: "plain-text", password: "plain-text" })).toBe(false);
    expect(await verifyPassword({ hash: "scrypt$0$8$1$AAAA$AAAA", password: "x" })).toBe(false);
  });

  it("enforces the length limits", () => {
    expect(isPasswordLengthValid("a".repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(isPasswordLengthValid("a".repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(isPasswordLengthValid("a".repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
  });
});
