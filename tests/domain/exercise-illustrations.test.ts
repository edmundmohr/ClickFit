import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EXERCISES_BY_ID } from "@/data/exercises";
import { ILLUSTRATED_EXERCISE_IDS, exerciseIllustrationPath } from "@/data/exercises/illustrations";

const DIRECTORY = join(process.cwd(), "public", "illustrations", "exercises");

describe("Übungsillustrationen", () => {
  it("verweist nur auf Übungen aus dem Katalog, ohne Dubletten", () => {
    expect(new Set(ILLUSTRATED_EXERCISE_IDS).size).toBe(ILLUSTRATED_EXERCISE_IDS.length);
    for (const id of ILLUSTRATED_EXERCISE_IDS) expect(EXERCISES_BY_ID.has(id), id).toBe(true);
  });

  it("hat zu jedem Eintrag eine Bilddatei und zu jeder Bilddatei einen Eintrag", () => {
    for (const id of ILLUSTRATED_EXERCISE_IDS) expect(existsSync(join(DIRECTORY, `${id}.jpg`)), id).toBe(true);
    const files = readdirSync(DIRECTORY).map((file) => file.replace(/\.jpg$/, ""));
    expect(files.sort()).toEqual([...ILLUSTRATED_EXERCISE_IDS].sort());
  });

  it("liefert den Pfad nur für Übungen mit Bild", () => {
    expect(exerciseIllustrationPath("push-up")).toBe("/illustrations/exercises/push-up.jpg");
    expect(exerciseIllustrationPath("unknown-exercise")).toBeNull();
  });
});
