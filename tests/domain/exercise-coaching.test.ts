import { describe, expect, it } from "vitest";
import { splitMistake } from "@/domain/exercises/coaching";

describe("splitMistake", () => {
  it("separates the fault from its correction", () => {
    expect(splitMistake("Hohlkreuz – Bauch fest, Gesäß bleibt auf der Bank")).toEqual({
      fault: "Hohlkreuz",
      fix: "Bauch fest, Gesäß bleibt auf der Bank",
    });
  });

  it("capitalises the correction for its own line", () => {
    expect(splitMistake("Stange prallt ab – kurz kontrolliert aufsetzen").fix).toBe("Kurz kontrolliert aufsetzen");
  });

  it("splits only at the first separator", () => {
    expect(splitMistake("Zu schnell – Tempo 2 – 0 – 2 halten")).toEqual({ fault: "Zu schnell", fix: "Tempo 2 – 0 – 2 halten" });
  });

  it("keeps entries without a separator as a fault", () => {
    expect(splitMistake("Schwung aus dem Rücken")).toEqual({ fault: "Schwung aus dem Rücken", fix: "" });
  });
});
