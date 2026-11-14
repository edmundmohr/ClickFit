import { describe, expect, it } from "vitest";
import { showsLogin } from "@/sw/session";

describe("service worker session detection", () => {
  it("recognises the login page, also after a redirect", () => {
    expect(showsLogin("https://clickfit.example/login")).toBe(true);
    expect(showsLogin("https://clickfit.example/login?next=%2Ftraining")).toBe(true);
  });

  it("does not treat other pages or missing URLs as signed out", () => {
    expect(showsLogin("https://clickfit.example/training")).toBe(false);
    expect(showsLogin("https://clickfit.example/login-hilfe")).toBe(false);
    expect(showsLogin("")).toBe(false);
    expect(showsLogin("kaputt")).toBe(false);
  });
});
