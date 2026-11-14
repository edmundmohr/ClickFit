import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/server/same-origin";

const request = (origin?: string) =>
  new Request("https://clickfit.online/api/sync", { method: "POST", headers: origin ? { origin } : {} });

describe("same-origin check", () => {
  it("accepts requests from the app itself", () => {
    expect(isSameOrigin(request("https://clickfit.online"))).toBe(true);
  });

  it("rejects requests from other sites", () => {
    expect(isSameOrigin(request("https://evil.example"))).toBe(false);
    expect(isSameOrigin(request("https://clickfit.online.evil.example"))).toBe(false);
    expect(isSameOrigin(request("null"))).toBe(false);
  });

  it("leaves requests without an origin to the session check", () => {
    expect(isSameOrigin(request())).toBe(true);
  });
});
