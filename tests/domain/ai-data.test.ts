import { describe, expect, it } from "vitest";
import { EXERCISES_BY_ID } from "@/data/exercises";
import { AI_SECTIONS, formatDataContext, type AiDataSnapshot } from "@/domain/ai/data-context";
import { exerciseProgress, weeklySetsPerMuscle, weeklySummaries } from "@/domain/ai/data-summary";
import { normalizeReview, type RawReview } from "@/domain/ai/review";
import { weightTrend } from "@/domain/nutrition/adaptive";
import type { TrainedSet } from "@/domain/progress/types";
import { addDays } from "@/lib/dates";

// 2026-11-16 ist ein Montag.
const MON = "2026-11-16";
const BENCH = "barbell-bench-press";
const lookup = (id: string) => EXERCISES_BY_ID.get(id);

function set(date: string, weightKg: number, reps: number, overrides: Partial<TrainedSet> = {}): TrainedSet {
  return {
    exerciseId: BENCH,
    sessionId: `s-${date}`,
    date,
    completedAt: new Date(`${date}T18:00:00Z`),
    type: "work",
    weightKg,
    reps,
    rir: 2,
    ...overrides,
  };
}

function emptySnapshot(): AiDataSnapshot {
  return {
    today: MON,
    from: addDays(MON, -55),
    profile: null,
    settings: { recoveryMode: false, gripModule: false, vacation: null, cycle: null, extraSports: [] },
    training: { sessions: [], exercises: [], weeklySets: {}, exerciseNotes: [], setNotes: [], plan: [] },
    recovery: {},
    nutrition: {
      target: null,
      adaptive: null,
      kcal: [],
      proteinG: [],
      carbsG: [],
      fatG: [],
      waterMl: [],
      waterGoalMl: null,
      supplements: [],
    },
    body: { weights: [], measurements: [], bodyFat: [], photos: 0 },
    cardio: { activities: [], planned: [] },
    mobility: [],
    steps: [],
    restingHeartRate: [],
  };
}

describe("AI data summary", () => {
  it("groups daily values into calendar weeks inside the window", () => {
    const values = [
      { date: addDays(MON, -8), value: 2000 }, // Sonntag der Vorwoche
      { date: addDays(MON, -7), value: 1000 },
      { date: addDays(MON, -6), value: 3000 },
      { date: MON, value: 2500 },
      { date: addDays(MON, -100), value: 9999 },
    ];
    expect(weeklySummaries(values, addDays(MON, -30), MON)).toEqual([
      { weekStart: addDays(MON, -14), days: 1, average: 2000, total: 2000 },
      { weekStart: addDays(MON, -7), days: 2, average: 2000, total: 4000 },
      { weekStart: MON, days: 1, average: 2500, total: 2500 },
    ]);
  });

  it("compares the first and last session per exercise and finds plateaus in the history", () => {
    const history = [0, 7, 14, 21, 28, 35].map((offset) => set(addDays(MON, offset - 35), 80, 5));
    const recent = history.slice(-2);
    const [progress] = exerciseProgress(recent, history, lookup, 10);
    expect(progress).toMatchObject({ name: lookup(BENCH)?.name, sessions: 2, sets: 2, avgRir: 2 });
    expect(progress.first).toMatchObject({ date: addDays(MON, -7), weightKg: 80, reps: 5 });
    expect(progress.plateauDays).toBe(35);

    const growing = [set(addDays(MON, -7), 80, 5), set(MON, 85, 5)];
    expect(exerciseProgress(growing, growing, lookup, 10)[0]).toMatchObject({ plateauDays: null, last: { weightKg: 85 } });
    // Aufwärmsätze zählen nicht als eigene Übung.
    expect(exerciseProgress([set(MON, 20, 10, { type: "warmup" })], [], lookup, 10)).toEqual([]);
  });

  it("averages working sets per muscle and week", () => {
    const sets = [set(addDays(MON, -7), 80, 5), set(addDays(MON, -7), 80, 5), set(MON, 80, 5), set(MON, 80, 5)];
    const weekly = weeklySetsPerMuscle(sets, lookup, addDays(MON, -13), MON);
    expect(weekly.chest).toBe(2);
    expect(weekly.quads).toBeUndefined();
  });
});

describe("AI data context", () => {
  it("names missing data instead of leaving it out", () => {
    const text = formatDataContext(emptySnapshot());
    expect(text).toContain("Profil: noch nicht ausgefüllt.");
    expect(text).toContain("Körpergewicht: keine Messungen");
    expect(text).toContain("Schritte pro Tag: keine Einträge");
    expect(text).toContain("Zyklus: nicht erfasst.");
  });

  it("contains all areas with numbers, notes and the cycle", () => {
    const snapshot = emptySnapshot();
    snapshot.profile = {
      sex: "female",
      ageYears: 34,
      heightCm: 170,
      goal: "fat_loss",
      experience: "intermediate",
      activityLevel: "light",
      trainingWeekdays: 3,
      sessionMinutes: 60,
      injuries: ["knee"],
      injuryNote: "Knie   zwickt\nbeim Laufen",
      cardioWish: { wanted: true, types: ["running"], sessionsPerWeek: 2 },
      excludedExercises: ["Kreuzheben"],
    };
    snapshot.settings.cycle = { day: 3, phase: "menstruation", lengthDays: 28 };
    snapshot.training.setNotes = [{ date: MON, exercise: "Bankdrücken", note: "Schulter unangenehm" }];
    snapshot.nutrition.target = { kcal: 2000, proteinG: 140, carbsG: 200, fatG: 70, source: "adaptive" };
    snapshot.nutrition.proteinG = [{ weekStart: MON, days: 3, average: 95.4, total: 286 }];
    snapshot.body.weights = weightTrend([
      { date: addDays(MON, -7), weightKg: 70 },
      { date: addDays(MON, -6), weightKg: 69.8 },
      { date: MON, weightKg: 69 },
    ]);
    snapshot.steps = [{ weekStart: MON, days: 1, average: 8123, total: 8123 }];

    const text = formatDataContext(snapshot);
    expect(text).toContain("weiblich, etwa 34 Jahre, 170 cm");
    expect(text).toContain('"Knie zwickt beim Laufen"');
    expect(text).toContain("geschätzte Phase: menstruation");
    expect(text).toContain('Bankdrücken: "Schulter unangenehm"');
    expect(text).toContain("2000 kcal, 140 g Eiweiß");
    expect(text).toContain("Ø 95 g (3 Tage)");
    expect(text).toContain("Ø 8123 Schritte");
    // Eine Gewichtszeile pro Woche: die letzte Messung der Woche.
    expect(text).toContain(`${addDays(MON, -6)}: Messwert 69.8 kg`);
    expect(text).not.toContain(`${addDays(MON, -7)}: Messwert`);
  });

  it("includes only the requested sections", () => {
    const snapshot = emptySnapshot();
    snapshot.steps = [{ weekStart: MON, days: 1, average: 8000, total: 8000 }];
    const text = formatDataContext(snapshot, ["profile", "body"]);
    expect(text).toContain("Profil");
    expect(text).toContain("Körpergewicht");
    expect(text).not.toContain("Schritte");
    expect(text).not.toContain("Krafttraining");
    expect(AI_SECTIONS).toHaveLength(9);
  });
});

describe("AI review", () => {
  const raw: RawReview = {
    summary: "  Gute   Woche. ",
    answer: "Mehr Eiweiß.",
    areas: [
      { area: "nutrition", status: "act", text: "Zu wenig Eiweiß." },
      { area: "training", status: "good", text: "Bankdrücken steigt." },
      { area: "training", status: "act", text: "Doppelt." },
      { area: "astrology", status: "good", text: "Gibt es nicht." },
      { area: "body", status: "great", text: "Unbekannter Status." },
    ],
    recommendations: Array.from({ length: 8 }, (_, index) => ({ area: "nutrition", text: `Tipp ${index + 1}` })),
    dataGaps: ["", "Ruhepuls fehlt."],
  };

  it("keeps known areas once, in a fixed order, and trims the rest", () => {
    const review = normalizeReview(raw, true);
    expect(review?.summary).toBe("Gute Woche.");
    expect(review?.answer).toBe("Mehr Eiweiß.");
    expect(review?.areas.map((item) => item.area)).toEqual(["training", "nutrition"]);
    expect(review?.areas[0].text).toBe("Bankdrücken steigt.");
    expect(review?.recommendations).toHaveLength(6);
    expect(review?.dataGaps).toEqual(["Ruhepuls fehlt."]);
  });

  it("drops an answer without a question and rejects empty results", () => {
    expect(normalizeReview(raw, false)?.answer).toBeNull();
    expect(normalizeReview({ summary: " ", answer: null, areas: [], recommendations: [], dataGaps: [] }, false)).toBeNull();
  });
});
