import { describe, expect, it } from "vitest";
import messages from "../../messages";
import { ERROR_CODES } from "@/lib/errors";

function collectStrings(value: unknown, path: string, out: Map<string, string>): void {
  if (typeof value === "string") {
    out.set(path, value);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collectStrings(child, `${path}.${key}`, out);
  }
}

describe("message catalogue", () => {
  it("has a translation for every error code", () => {
    for (const code of ERROR_CODES) expect(messages.errors[code]).toBeTruthy();
  });

  it("contains no empty texts", () => {
    const all = new Map<string, string>();
    collectStrings(messages, "messages", all);
    expect(all.size).toBeGreaterThan(0);
    for (const [path, text] of all) expect(text.trim(), path).not.toBe("");
  });
});
