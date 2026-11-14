import { describe, expect, it } from "vitest";
import { csvText, renderCsv } from "@/domain/export/csv";
import type { ExportTable } from "@/domain/export/types";
import { detectFormat, parseHealthPayload } from "@/domain/health-import";
import { deriveExternalId } from "@/domain/health-import/collector";
import { parseCsv, parseCsvNumber } from "@/domain/health-import/csv";
import { detectDelimiter, readCsv } from "@/domain/health-import/csv-reader";
import { estimateEffort } from "@/domain/health-import/effort";
import { parseHealthAutoExport } from "@/domain/health-import/health-auto-export";
import { parseSimplePayload } from "@/domain/health-import/simple";
import { averageBetween, dailySeries, latestValue } from "@/domain/health-import/summary";
import { localDateOf, localTimeToInstant, parseMoment } from "@/domain/health-import/timestamps";
import { HealthImportError, LIMITS } from "@/domain/health-import/types";
import { mapWorkoutName } from "@/domain/health-import/workout-types";
import { toLocalDate } from "@/lib/dates";

/** Samstag, 14.11.2026, 20:00 Uhr in Berlin. */
const NOW = new Date("2026-11-14T19:00:00Z");
const TODAY = "2026-11-14";

describe("parseMoment", () => {
  it("reads the Health Auto Export format and takes the day in the app's time zone", () => {
    const moment = parseMoment("2026-11-14 07:31:00 +0100");
    expect(moment?.instant.toISOString()).toBe("2026-11-14T06:31:00.000Z");
    expect(moment?.date).toBe("2026-11-14");
    // 23:30 Uhr in New York ist in Berlin schon der nächste Tag.
    expect(parseMoment("2026-11-13 23:30:00 -0500")?.date).toBe("2026-11-14");
  });

  it("reads ISO 8601 with and without a zone", () => {
    expect(parseMoment("2026-11-14T06:31:00Z")?.instant.toISOString()).toBe("2026-11-14T06:31:00.000Z");
    expect(parseMoment("2026-11-14T06:31:00.250+01:00")?.instant.toISOString()).toBe("2026-11-14T05:31:00.000Z");
    // Ohne Zone gilt die Uhrzeit in Berlin: im Winter UTC+1, im Sommer UTC+2.
    expect(parseMoment("2026-11-14T18:00:00")?.instant.toISOString()).toBe("2026-11-14T17:00:00.000Z");
    expect(parseMoment("2026-07-01T18:00")?.instant.toISOString()).toBe("2026-07-01T16:00:00.000Z");
  });

  it("reads plain dates and the German notation", () => {
    expect(parseMoment("2026-11-14")).toMatchObject({ date: "2026-11-14", hasTime: false });
    expect(parseMoment("14.11.2026")).toMatchObject({ date: "2026-11-14", hasTime: false });
    expect(parseMoment("4.7.2026 18:05")?.instant.toISOString()).toBe("2026-07-04T16:05:00.000Z");
    expect(parseMoment("14.11.2026, 18:05:30")?.instant.toISOString()).toBe("2026-11-14T17:05:30.000Z");
  });

  it("rejects what is not a date", () => {
    for (const value of ["", "gestern", "2026-02-30", "31.04.2026", "2026-11-14 25:00:00", "14/11/2026", 20261114, null]) {
      expect(parseMoment(value)).toBeNull();
    }
  });

  it("derives the local day exactly like toLocalDate", () => {
    const instants = ["2026-11-14T22:59:59Z", "2026-11-14T23:00:00Z", "2026-03-29T00:59:59Z", "2026-07-01T21:59:59Z", "2026-07-01T22:00:00Z", "2026-12-31T23:30:00Z"];
    for (const iso of instants) expect(localDateOf(new Date(iso)), iso).toBe(toLocalDate(new Date(iso)));
    expect(localDateOf(new Date("2026-11-14T23:00:00Z"))).toBe("2026-11-15");
  });

  it("converts local time across the daylight saving switch", () => {
    expect(localTimeToInstant("2026-03-29", 1, 30, 0).toISOString()).toBe("2026-03-29T00:30:00.000Z");
    expect(localTimeToInstant("2026-03-29", 3, 30, 0).toISOString()).toBe("2026-03-29T01:30:00.000Z");
    expect(localTimeToInstant("2026-10-25", 12, 0, 0).toISOString()).toBe("2026-10-25T11:00:00.000Z");
  });
});

describe("mapWorkoutName", () => {
  it("maps English and German names", () => {
    const cases: [string, string][] = [
      ["Running", "running"],
      ["Outdoor Run", "running"],
      ["Laufen", "running"],
      ["Cycling", "cycling"],
      ["Indoor Cycle", "cycling"],
      ["Radfahren", "cycling"],
      ["Walking", "walking"],
      ["Outdoor Walk", "walking"],
      ["Hiking", "hiking"],
      ["Pool Swim", "swimming"],
      ["Rowing", "rowing"],
      ["Elliptical", "cross_trainer"],
      ["Cross Trainer", "cross_trainer"],
      ["Yoga", "yoga"],
      ["Soccer", "football"],
      ["Football", "football"],
      ["American Football", "team_sport"],
      ["Tennis", "racket_sport"],
      ["Table Tennis", "racket_sport"],
      ["Badminton", "racket_sport"],
      ["Squash", "racket_sport"],
      ["Padel", "racket_sport"],
      ["Climbing", "climbing"],
      ["Stair Climbing", "other"],
      ["Boxing", "martial_arts"],
      ["Kickboxing", "martial_arts"],
      ["Martial Arts", "martial_arts"],
      ["Downhill Skiing", "skiing"],
      ["Snowboarding", "skiing"],
      ["Dance", "dancing"],
      ["Basketball", "team_sport"],
      ["Volleyball", "team_sport"],
      ["Handball", "team_sport"],
      ["Hockey", "team_sport"],
      ["cross_trainer", "cross_trainer"],
      ["Racket Sport", "racket_sport"],
      ["Pilates", "other"],
      ["Seilspringen", "other"],
    ];
    for (const [name, expected] of cases) expect(mapWorkoutName(name), name).toBe(expected);
  });

  it("maps every label the app exports back to its type", () => {
    const labels: [string, string][] = [
      ["Gehen", "walking"],
      ["Schwimmen", "swimming"],
      ["Rudern", "rowing"],
      ["Crosstrainer", "cross_trainer"],
      ["Wandern", "hiking"],
      ["Fußball", "football"],
      ["Schlägersport", "racket_sport"],
      ["Klettern", "climbing"],
      ["Kampfsport", "martial_arts"],
      ["Mannschaftssport", "team_sport"],
      ["Skifahren", "skiing"],
      ["Tanzen", "dancing"],
      ["Sonstiges", "other"],
    ];
    for (const [name, expected] of labels) expect(mapWorkoutName(name), name).toBe(expected);
  });

  it("recognises strength training, which is never imported", () => {
    for (const name of ["Traditional Strength Training", "Functional Strength Training", "Krafttraining", "Weightlifting"]) {
      expect(mapWorkoutName(name), name).toBe("strength");
    }
  });
});

describe("parseSimplePayload", () => {
  it("accepts the short forms for Home Assistant with today's date", () => {
    expect(parseSimplePayload({ weight: 81.2 }, NOW).weights).toEqual([{ date: TODAY, kg: 81.2 }]);
    expect(parseSimplePayload({ weight: { kg: 81.2 } }, NOW).weights).toEqual([{ date: TODAY, kg: 81.2 }]);
    expect(parseSimplePayload({ weight: "81,25" }, NOW).weights).toEqual([{ date: TODAY, kg: 81.25 }]);
    expect(parseSimplePayload({ steps: 8500, restingHeartRate: 52 }, NOW)).toMatchObject({
      steps: [{ date: TODAY, count: 8500 }],
      restingHeartRates: [{ date: TODAY, bpm: 52 }],
    });
  });

  it("reads the full format and converts pounds", () => {
    const result = parseSimplePayload(
      {
        weight: [{ date: "2026-11-13", kg: 81.4 }, { date: "2026-11-12", lbs: 180 }, { kg: 81.2 }],
        steps: [{ date: "2026-11-13", count: 9000 }, { date: "2026-11-13", count: 1500 }],
        restingHeartRate: [{ date: "2026-11-13", bpm: 51.6 }],
        workouts: [
          { id: "run-1", type: "running", start: "2026-11-13T18:00:00+01:00", end: "2026-11-13T18:45:00+01:00", distanceKm: 7.5, avgHeartRate: 152 },
          { type: "Radfahren", start: "2026-11-12T08:00:00Z", durationMinutes: 60 },
        ],
      },
      NOW,
    );
    expect(result.weights).toEqual([
      { date: "2026-11-12", kg: 81.65 },
      { date: "2026-11-13", kg: 81.4 },
      { date: TODAY, kg: 81.2 },
    ]);
    expect(result.steps).toEqual([{ date: "2026-11-13", count: 10500 }]);
    expect(result.restingHeartRates).toEqual([{ date: "2026-11-13", bpm: 52 }]);
    expect(result.workouts).toEqual([
      {
        externalId: "auto:cycling:2026-11-12T08:00:00.000Z",
        type: "cycling",
        start: new Date("2026-11-12T08:00:00Z"),
        durationSeconds: 3600,
        distanceMeters: null,
        avgHeartRate: null,
      },
      {
        externalId: "run-1",
        type: "running",
        start: new Date("2026-11-13T17:00:00Z"),
        durationSeconds: 2700,
        distanceMeters: 7500,
        avgHeartRate: 152,
      },
    ]);
    expect(result.skipped).toBe(0);
  });

  it("derives the start of a workout without one from its end or from now", () => {
    const [byEnd] = parseSimplePayload({ workouts: [{ type: "walking", end: "2026-11-14T12:00:00Z", durationMinutes: 30 }] }, NOW).workouts;
    expect(byEnd.start.toISOString()).toBe("2026-11-14T11:30:00.000Z");
    const [byNow] = parseSimplePayload({ workouts: [{ type: "walking", durationMinutes: 30 }] }, NOW).workouts;
    expect(byNow.start.toISOString()).toBe("2026-11-14T18:30:00.000Z");
    expect(byNow.externalId).toBe(deriveExternalId("walking", byNow.start));
  });

  it("skips implausible and incomplete entries and counts them", () => {
    const result = parseSimplePayload(
      {
        weight: [{ kg: 19.9 }, { kg: 400.1 }, { kg: 20 }, { date: "2026-11-13", kg: 400 }, { date: "unsinn", kg: 80 }, {}, null],
        steps: [{ count: -1 }, { count: 200_001 }, { date: "2026-11-13", count: 200_000 }, { date: "2026-11-13", count: 1 }],
        restingHeartRate: [{ bpm: 24 }, { bpm: 201 }, { bpm: 25 }, { date: "2026-11-13", bpm: 200 }],
        workouts: [
          { type: "running", start: "2026-11-13T10:00:00Z", durationMinutes: 0.5 },
          { type: "running", start: "2026-11-12T10:00:00Z", durationMinutes: 24 * 60 + 1 },
          { type: "running", start: "2026-11-13T10:00:00Z" },
          { start: "2026-11-13T10:00:00Z", durationMinutes: 30 },
          { type: "running", start: "kaputt", durationMinutes: 30 },
          { type: "running", start: "2026-11-13T12:00:00Z", durationMinutes: 1, distanceKm: -3, avgHeartRate: 400 },
        ],
      },
      NOW,
    );
    expect(result.weights).toEqual([{ date: "2026-11-13", kg: 400 }, { date: TODAY, kg: 20 }]);
    expect(result.steps).toEqual([{ date: "2026-11-13", count: 200_000 }]);
    expect(result.restingHeartRates).toEqual([{ date: "2026-11-13", bpm: 200 }, { date: TODAY, bpm: 25 }]);
    // Unbrauchbare Zusatzwerte fallen weg, die Einheit bleibt.
    expect(result.workouts).toMatchObject([{ durationSeconds: 60, distanceMeters: null, avgHeartRate: null }]);
    expect(result.skipped).toBe(5 + 3 + 2 + 5);
  });

  it("rejects dates in the future beyond one day and older than ten years", () => {
    const result = parseSimplePayload(
      {
        weight: [
          { date: "2026-11-15", kg: 80 },
          { date: "2026-11-16", kg: 80 },
          { date: "2016-11-14", kg: 80 },
          { date: "2016-11-13", kg: 80 },
        ],
        workouts: [
          { type: "running", start: "2026-11-15T18:59:00Z", durationMinutes: 30 },
          { type: "running", start: "2026-11-15T19:01:00Z", durationMinutes: 30 },
        ],
      },
      NOW,
    );
    expect(result.weights.map((entry) => entry.date)).toEqual(["2016-11-14", "2026-11-15"]);
    expect(result.workouts).toHaveLength(1);
    expect(result.skipped).toBe(3);
  });

  it("does not import strength training", () => {
    const result = parseSimplePayload(
      { workouts: [{ type: "Traditional Strength Training", start: "2026-11-13T10:00:00Z", durationMinutes: 60 }] },
      NOW,
    );
    expect(result.workouts).toEqual([]);
    expect(result.skipped).toBe(1);
  });

  it("rejects input without any known field and input with too many entries", () => {
    for (const value of [null, 42, "weight", [], {}, { gewicht: 80 }]) {
      expect(() => parseSimplePayload(value, NOW)).toThrow(HealthImportError);
    }
    const steps = Array.from({ length: LIMITS.maxEntriesPerKind + 1 }, () => ({ count: 1 }));
    expect(() => parseSimplePayload({ steps }, NOW)).toThrow(expect.objectContaining({ reason: "too_many_entries" }));
    expect(parseSimplePayload({ steps: steps.slice(1) }, NOW).steps).toEqual([{ date: TODAY, count: LIMITS.maxEntriesPerKind }]);
  });
});

describe("parseHealthAutoExport", () => {
  const payload = {
    data: {
      metrics: [
        {
          name: "weight_body_mass",
          units: "kg",
          data: [
            { date: "2026-11-14 07:31:00 +0100", qty: 81.2 },
            { date: "2026-11-14 06:10:00 +0100", qty: 81.9 },
            { date: "2026-11-13 07:00:00 +0100", qty: 81.6 },
          ],
        },
        {
          name: "step_count",
          units: "count",
          data: [
            { date: "2026-11-13 09:00:00 +0100", qty: 3000.4 },
            { date: "2026-11-13 15:00:00 +0100", qty: 4500.4 },
            { date: "2026-11-14 00:00:00 +0100", qty: 1200 },
            { date: "2026-11-14 00:00:00 +0100" },
          ],
        },
        {
          name: "resting_heart_rate",
          units: "count/min",
          data: [
            { date: "2026-11-13 00:00:00 +0100", qty: 54 },
            { date: "2026-11-13 23:00:00 +0100", qty: 52 },
            { qty: 50 },
          ],
        },
        { name: "active_energy", units: "kJ", data: [{ date: "2026-11-14 00:00:00 +0100", qty: 2100 }] },
      ],
      workouts: [
        {
          id: "6A0E1D9C",
          name: "Running",
          start: "2026-11-13 18:00:00 +0100",
          end: "2026-11-13 18:50:00 +0100",
          duration: 2820,
          distance: { qty: 5.2, units: "km" },
          avgHeartRate: { qty: 150.4, units: "bpm" },
        },
        {
          name: "Outdoor Cycle",
          start: "2026-11-12 08:00:00 +0100",
          end: "2026-11-12 09:30:00 +0100",
          distance: { qty: 20, units: "mi" },
          heartRate: { avg: { qty: 131 } },
        },
        { name: "Traditional Strength Training", start: "2026-11-11 18:00:00 +0100", end: "2026-11-11 19:00:00 +0100" },
        { name: "Yoga", end: "2026-11-11 19:00:00 +0100" },
      ],
    },
  };

  it("maps weight, steps, resting heart rate and workouts", () => {
    const result = parseHealthAutoExport(payload, NOW);
    // Gewicht und Ruhepuls: der letzte Wert des Tages, unabhängig von der Reihenfolge.
    expect(result.weights).toEqual([{ date: "2026-11-13", kg: 81.6 }, { date: TODAY, kg: 81.2 }]);
    expect(result.restingHeartRates).toEqual([{ date: "2026-11-13", bpm: 52 }]);
    // Schritte: Summe des Tages.
    expect(result.steps).toEqual([{ date: "2026-11-13", count: 7501 }, { date: TODAY, count: 1200 }]);
    expect(result.workouts).toEqual([
      {
        externalId: "auto:cycling:2026-11-12T07:00:00.000Z",
        type: "cycling",
        start: new Date("2026-11-12T07:00:00Z"),
        durationSeconds: 5400,
        distanceMeters: 32186.9,
        avgHeartRate: 131,
      },
      {
        externalId: "6A0E1D9C",
        type: "running",
        start: new Date("2026-11-13T17:00:00Z"),
        durationSeconds: 2820,
        distanceMeters: 5200,
        avgHeartRate: 150,
      },
    ]);
    // Schritte ohne Wert, Ruhepuls ohne Datum, Krafttraining, Yoga ohne Beginn; die unbekannte Metrik zählt nicht.
    expect(result.skipped).toBe(4);
  });

  it("converts pounds and skips a weight in an unknown unit", () => {
    const pounds = { data: { metrics: [{ name: "weight_body_mass", units: "lb", data: [{ date: "2026-11-14 07:00:00 +0100", qty: 179 }] }] } };
    expect(parseHealthAutoExport(pounds, NOW).weights).toEqual([{ date: TODAY, kg: 81.19 }]);
    const stone = { data: { metrics: [{ name: "weight_body_mass", units: "st", data: [{ date: "2026-11-14 07:00:00 +0100", qty: 12.8 }] }] } };
    expect(parseHealthAutoExport(stone, NOW)).toMatchObject({ weights: [], skipped: 1 });
  });

  it("keeps the last duplicate of a workout", () => {
    const workout = { id: "w1", name: "Hiking", start: "2026-11-13 10:00:00 +0100" };
    const result = parseHealthAutoExport({ data: { workouts: [{ ...workout, duration: 600 }, { ...workout, duration: 7200 }] } }, NOW);
    expect(result.workouts).toMatchObject([{ externalId: "w1", type: "hiking", durationSeconds: 7200 }]);
  });

  it("rejects an envelope whose lists are not lists", () => {
    expect(() => parseHealthAutoExport({ data: { metrics: "x" } }, NOW)).toThrow(HealthImportError);
    expect(() => parseHealthAutoExport({ data: { metrics: null } }, NOW)).toThrow(HealthImportError);
    expect(() => parseHealthAutoExport({ weight: 80 }, NOW)).toThrow(HealthImportError);
    expect(parseHealthAutoExport({ data: { metrics: [], workouts: [] } }, NOW)).toMatchObject({ weights: [], workouts: [], skipped: 0 });
  });
});

describe("format detection", () => {
  it("tells the two formats apart", () => {
    expect(detectFormat({ data: { metrics: [] } })).toBe("health_auto_export");
    expect(detectFormat({ data: { workouts: [] } })).toBe("health_auto_export");
    expect(detectFormat({ weight: 81.2 })).toBe("simple");
    expect(detectFormat({ data: { other: 1 } })).toBe("simple");
    expect(parseHealthPayload({ weight: 81.2 }, NOW).weights).toHaveLength(1);
    expect(parseHealthPayload({ data: { metrics: [{ name: "step_count", data: [{ date: "2026-11-14 00:00:00 +0100", qty: 10 }] }] } }, NOW).steps).toEqual([
      { date: TODAY, count: 10 },
    ]);
    expect(() => parseHealthPayload({ data: { other: 1 } }, NOW)).toThrow(HealthImportError);
  });
});

describe("csv reader", () => {
  it("detects the delimiter and handles BOM, quotes and line breaks", () => {
    expect(detectDelimiter("a;b;c\n1,5;2;3")).toBe(";");
    expect(detectDelimiter("a,b\n1,2")).toBe(",");
    expect(detectDelimiter("a\tb\n1\t2")).toBe("\t");
    expect(detectDelimiter('"a;b",c')).toBe(",");
    const records = readCsv('\u{FEFF}Datum;Notiz\r\n14.11.2026;"Zeile 1\nZeile ""2"""\r\n\r\n15.11.2026; x \r\n');
    expect(records).toEqual([
      { line: 1, fields: ["Datum", "Notiz"] },
      { line: 2, fields: ["14.11.2026", 'Zeile 1\nZeile "2"'] },
      { line: 5, fields: ["15.11.2026", "x"] },
    ]);
  });

  it("parses numbers with decimal comma, decimal point and thousands separators", () => {
    expect(parseCsvNumber("81,2")).toBe(81.2);
    expect(parseCsvNumber("81.2")).toBe(81.2);
    expect(parseCsvNumber("1.234,5")).toBe(1234.5);
    expect(parseCsvNumber("1,234.5")).toBe(1234.5);
    expect(parseCsvNumber("12.345", true)).toBe(12345);
    expect(parseCsvNumber("12 345", true)).toBe(12345);
    expect(parseCsvNumber("12.345")).toBe(12.345);
    expect(parseCsvNumber("")).toBeNull();
    expect(parseCsvNumber("abc")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("imports the weight CSV the app exports", () => {
    const table: ExportTable = {
      key: "weight",
      name: "Gewicht",
      columns: [
        { key: "date", label: "Datum", type: "date" },
        { key: "bodyWeight", label: "Gewicht (kg)", type: "number", decimals: 2 },
        { key: "trend", label: "Trend (kg)", type: "number", decimals: 2 },
      ],
      rows: [
        { date: "2026-11-12", bodyWeight: 81.4, trend: 81.5 },
        { date: "2026-11-13", bodyWeight: 81.25, trend: 81.45 },
        { date: "2026-11-14", bodyWeight: 80, trend: 81.3 },
      ],
    };
    const expected = [
      { date: "2026-11-12", kg: 81.4 },
      { date: "2026-11-13", kg: 81.25 },
      { date: "2026-11-14", kg: 80 },
    ];
    expect(csvText(table)).toContain("12.11.2026;81,40;81,50");
    expect(parseCsv(csvText(table), "weight", NOW)).toEqual({
      data: { weights: expected, steps: [], restingHeartRates: [], workouts: [], skipped: 0 },
      rows: 3,
      errors: [],
      errorCount: 0,
      fatal: null,
    });
    // Die fertige Datei beginnt mit einer BOM.
    expect(parseCsv(new TextDecoder("utf-8", { ignoreBOM: true }).decode(renderCsv(table)), "weight", NOW).data.weights).toEqual(expected);
  });

  it("imports an exported weight CSV in pounds and cells with formula guard", () => {
    const result = parseCsv("Datum;Gewicht (lbs);Trend (lbs)\r\n'14.11.2026;'179,0;179,5\r\n", "weight", NOW);
    expect(result.data.weights).toEqual([{ date: TODAY, kg: 81.19 }]);
  });

  it("reads English headers, commas, ISO dates and files without a header", () => {
    expect(parseCsv("Date,Weight\n2026-11-13,81.4\n2026-11-14,81.2\n", "weight", NOW).data.weights).toEqual([
      { date: "2026-11-13", kg: 81.4 },
      { date: TODAY, kg: 81.2 },
    ]);
    expect(parseCsv("Wert\tkg\tDatum\n1\t81,4\t13.11.2026\n", "weight", NOW).data.weights).toEqual([{ date: "2026-11-13", kg: 81.4 }]);
    expect(parseCsv("13.11.2026;81,4\n14.11.2026;81,2", "weight", NOW).data.weights).toHaveLength(2);
  });

  it("sums steps of one day and keeps the last resting heart rate", () => {
    const steps = parseCsv("Datum;Schritte\n13.11.2026 09:00;3.000\n13.11.2026 15:00;4500\n14.11.2026;1200\n", "steps", NOW);
    expect(steps.data.steps).toEqual([{ date: "2026-11-13", count: 7500 }, { date: TODAY, count: 1200 }]);
    const english = parseCsv('"Date","Steps"\n"2026-11-13","8,500"\n', "steps", NOW);
    expect(english.data.steps).toEqual([{ date: "2026-11-13", count: 8500 }]);
    const pulse = parseCsv("Datum;Ruhepuls\n13.11.2026 07:00;54\n13.11.2026 22:00;52\n", "resting_heart_rate", NOW);
    expect(pulse.data.restingHeartRates).toEqual([{ date: "2026-11-13", bpm: 52 }]);
    expect(parseCsv("date,resting heart rate\n2026-11-13,51\n", "resting_heart_rate", NOW).data.restingHeartRates).toEqual([
      { date: "2026-11-13", bpm: 51 },
    ]);
    expect(parseCsv("Tag;Puls\n13.11.2026;49\n", "resting_heart_rate", NOW).data.restingHeartRates).toEqual([{ date: "2026-11-13", bpm: 49 }]);
  });

  it("imports the activities CSV the app exports", () => {
    const text = [
      "Datum;Art;Dauer (min);Distanz (km);Puls (Schläge/min);Puls-Zone;Anstrengung;Notiz",
      "13.11.2026;Laufen;45;7,5;152;4;Hart;'-locker",
      "12.11.2026;Yoga;30;;;;Leicht;",
      "",
    ].join("\r\n");
    const result = parseCsv(text, "activities", NOW);
    expect(result.errors).toEqual([]);
    expect(result.data.workouts).toEqual([
      {
        externalId: "auto:yoga:2026-11-12T11:00:00.000Z",
        type: "yoga",
        start: new Date("2026-11-12T11:00:00Z"),
        durationSeconds: 1800,
        distanceMeters: null,
        avgHeartRate: null,
      },
      {
        externalId: "auto:running:2026-11-13T11:00:00.000Z",
        type: "running",
        start: new Date("2026-11-13T11:00:00Z"),
        durationSeconds: 2700,
        distanceMeters: 7500,
        avgHeartRate: 152,
      },
    ]);
  });

  it("reads English activity headers with a start time", () => {
    const result = parseCsv("Start,Type,Duration,Distance,Heart rate\n2026-11-13 18:00,Cycling,60,25.5,130\n", "activities", NOW);
    expect(result.data.workouts).toMatchObject([
      { type: "cycling", start: new Date("2026-11-13T17:00:00Z"), durationSeconds: 3600, distanceMeters: 25500, avgHeartRate: 130 },
    ]);
  });

  it("reports row errors with line numbers and keeps the valid rows", () => {
    const text = [
      "Datum;Art;Dauer",
      "13.11.2026;Laufen;45",
      "gestern;Laufen;45",
      "13.11.2026;;45",
      "13.11.2026;Krafttraining;60",
      "13.11.2026;Rudern;lang",
      "13.11.2026;Rudern;0,5",
      "15.12.2026;Rudern;30",
    ].join("\n");
    const result = parseCsv(text, "activities", NOW);
    expect(result.data.workouts).toHaveLength(1);
    expect(result.errors).toEqual([
      { line: 3, issue: "date" },
      { line: 4, issue: "type" },
      { line: 5, issue: "strength" },
      { line: 6, issue: "value" },
      { line: 7, issue: "range" },
      { line: 8, issue: "date" },
    ]);
    expect(result).toMatchObject({ rows: 7, errorCount: 6, fatal: null });
    expect(result.data.skipped).toBe(6);
  });

  it("reports at most twenty row errors but counts all", () => {
    const text = ["Datum;Gewicht", ...Array.from({ length: 30 }, () => "14.11.2026;5")].join("\n");
    const result = parseCsv(text, "weight", NOW);
    expect(result.errors).toHaveLength(20);
    expect(result.errorCount).toBe(30);
    expect(result.errors[0]).toEqual({ line: 2, issue: "range" });
  });

  it("fails as a whole for empty files, unknown columns and too many rows", () => {
    expect(parseCsv("", "weight", NOW).fatal).toBe("empty");
    expect(parseCsv("\u{FEFF}\r\n", "weight", NOW).fatal).toBe("empty");
    expect(parseCsv("Datum;Gewicht\n", "weight", NOW).fatal).toBe("empty");
    expect(parseCsv("Datum;Schritte\n14.11.2026;100\n", "weight", NOW).fatal).toBe("columns");
    expect(parseCsv("Datum;Art\n14.11.2026;Laufen\n", "activities", NOW).fatal).toBe("columns");
    const many = ["Datum;Schritte", ...Array.from({ length: LIMITS.maxEntriesPerKind + 1 }, () => "14.11.2026;1")].join("\n");
    expect(parseCsv(many, "steps", NOW)).toMatchObject({ fatal: "too_many_rows", rows: LIMITS.maxEntriesPerKind + 1 });
  });
});

describe("estimateEffort", () => {
  it("derives zone and intensity from the average heart rate", () => {
    // Maximalpuls 180: Zone 1 ab 90, Zone 2 ab 108, Zone 3 ab 126, Zone 4 ab 144, Zone 5 ab 162.
    expect(estimateEffort(80, 180)).toEqual({ zone: null, intensity: "easy" });
    expect(estimateEffort(100, 180)).toEqual({ zone: 1, intensity: "easy" });
    expect(estimateEffort(120, 180)).toEqual({ zone: 2, intensity: "moderate" });
    expect(estimateEffort(140, 180)).toEqual({ zone: 3, intensity: "moderate" });
    expect(estimateEffort(150, 180)).toEqual({ zone: 4, intensity: "hard" });
    expect(estimateEffort(175, 180)).toEqual({ zone: 5, intensity: "hard" });
  });

  it("falls back to moderate without heart rate or profile", () => {
    expect(estimateEffort(null, 180)).toEqual({ zone: null, intensity: "moderate" });
    expect(estimateEffort(150, null)).toEqual({ zone: null, intensity: "moderate" });
  });
});

describe("summary", () => {
  const values = [
    { date: "2026-11-06", value: 20_000 },
    { date: "2026-11-08", value: 6000 },
    { date: "2026-11-13", value: 9000 },
    { date: "2026-11-14", value: 3000 },
  ];

  it("averages the days with a value and finds the latest one", () => {
    expect(averageBetween(values, "2026-11-08", "2026-11-14")).toBe(6000);
    expect(averageBetween(values, "2026-11-09", "2026-11-12")).toBeNull();
    expect(latestValue(values, "2026-11-13")).toEqual({ date: "2026-11-13", value: 9000 });
    expect(latestValue([], "2026-11-13")).toBeNull();
  });

  it("builds one row per day with gaps", () => {
    expect(dailySeries(values, "2026-11-14", 3)).toEqual([
      { date: "2026-11-12", value: null },
      { date: "2026-11-13", value: 9000 },
      { date: "2026-11-14", value: 3000 },
    ]);
  });
});
