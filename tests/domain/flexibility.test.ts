import { describe, expect, it } from "vitest";
import { EXERCISES, EXERCISES_BY_ID } from "@/data/exercises";
import { EQUIPMENT, MUSCLES, type Equipment, type Muscle } from "@/domain/exercises/types";
import { adaptDay, estimateDaySeconds, shortenDay, type DayEntry } from "@/domain/training/adaptation";
import { dayStatus } from "@/domain/training/calendar";
import { cycleStatus } from "@/domain/training/cycle";
import { avoidedPatterns, generatePlan, isExerciseAvailable, type ExercisePreference } from "@/domain/training/plan-generator";
import { nextSetTargets } from "@/domain/training/progression";
import { buildRecoveryDay, readiness } from "@/domain/training/recovery-day";
import { trainingStreak } from "@/domain/training/schedule";
import { afterSetCompleted, groupConsecutive, groupKind, groupRestSeconds, normalizeGroups } from "@/domain/training/supersets";
import type { TrainingProfile } from "@/domain/training/types";
import { isVacationActive, pauseDates, reentryFactor, type Vacation } from "@/domain/training/vacation";
import {
  calculatePlates,
  createLadder,
  fromKg,
  ladderFor,
  parseWeightList,
  plateIncrement,
  toKg,
  usesPlates,
  type BarSetup,
} from "@/domain/training/weights";
import {
  isLinkedToNext,
  linkWithNext,
  moveItem,
  unlinkFromNext,
  type EditorItem,
} from "@/features/training/components/routines/editor-state";

const GYM: Equipment[] = [...EQUIPMENT];
const HOME: Equipment[] = ["dumbbell", "bench", "resistance_band"];
const lookup = (id: string) => EXERCISES_BY_ID.get(id) ?? null;

function profile(overrides: Partial<TrainingProfile> = {}): TrainingProfile {
  return {
    goal: "muscle_gain",
    experience: "intermediate",
    weekdays: [1, 3, 5],
    sessionMinutes: 60,
    equipment: GYM,
    excludedExerciseIds: [],
    injuries: [],
    ...overrides,
  };
}

const entry = (exerciseId: string, overrides: Partial<DayEntry> = {}): DayEntry => ({
  exerciseId,
  sets: 3,
  restSeconds: 90,
  groupId: null,
  ...overrides,
});

const KG_BAR: BarSetup = {
  unit: "kg",
  barWeight: 20,
  plates: [25, 20, 15, 10, 5, 2.5, 1.25].map((weight) => ({ weight, pairs: 2 })),
};

describe("plate calculator", () => {
  it("lists the plates per side, heaviest first", () => {
    expect(calculatePlates(100, KG_BAR)).toEqual({ perSide: [25, 15], total: 100, missing: 0 });
    expect(calculatePlates(62.5, KG_BAR).perSide).toEqual([20, 1.25]);
  });

  it("returns only the bar when the target is at or below the bar weight", () => {
    expect(calculatePlates(20, KG_BAR)).toEqual({ perSide: [], total: 20, missing: 0 });
    expect(calculatePlates(15, KG_BAR).total).toBe(20);
  });

  it("reports what is missing when the plates cannot make the weight", () => {
    const result = calculatePlates(61, KG_BAR);
    expect(result.total).toBe(60);
    expect(result.missing).toBe(1);
  });

  it("finds the best combination when taking the biggest plate first would fail", () => {
    const limited: BarSetup = { unit: "kg", barWeight: 20, plates: [{ weight: 25, pairs: 1 }, { weight: 15, pairs: 2 }] };
    // 80 kg = 30 kg pro Seite: 25 + nichts ginge nicht auf, 15 + 15 schon.
    expect(calculatePlates(80, limited)).toEqual({ perSide: [15, 15], total: 80, missing: 0 });
  });

  it("respects the number of available pairs", () => {
    const few: BarSetup = { unit: "kg", barWeight: 20, plates: [{ weight: 20, pairs: 1 }, { weight: 5, pairs: 1 }] };
    expect(calculatePlates(140, few)).toEqual({ perSide: [20, 5], total: 70, missing: 70 });
  });

  it("works in pounds", () => {
    const lbs: BarSetup = { unit: "lbs", barWeight: 45, plates: [45, 25, 10, 5, 2.5].map((weight) => ({ weight, pairs: 3 })) };
    expect(calculatePlates(225, lbs).perSide).toEqual([45, 45]);
    expect(plateIncrement(lbs)).toBe(5);
  });
});

describe("weight ladders", () => {
  it("converts between kg and lbs", () => {
    expect(toKg(100, "lbs")).toBeCloseTo(45.359, 3);
    expect(fromKg(toKg(35, "lbs"), "lbs")).toBeCloseTo(35, 6);
    expect(toKg(40, "kg")).toBe(40);
  });

  it("steps in multiples of the increment", () => {
    const ladder = createLadder({ unit: "kg", increment: 2.5 });
    expect(ladder.up(60)).toBe(62.5);
    expect(ladder.up(61)).toBe(62.5);
    expect(ladder.down(60)).toBe(57.5);
    expect(ladder.down(1)).toBe(0);
    expect(ladder.nearest(61.3)).toBe(62.5);
  });

  it("uses a fixed list of weights when one is given", () => {
    const ladder = createLadder({ unit: "kg", increment: 2, values: [4, 6, 8, 10, 12.5, 15] });
    expect(ladder.up(10)).toBe(12.5);
    expect(ladder.down(10)).toBe(8);
    expect(ladder.up(15)).toBe(15);
    expect(ladder.down(4)).toBe(4);
    expect(ladder.nearest(11)).toBe(10);
  });

  it("steps in pounds and returns kilograms", () => {
    const ladder = createLadder({ unit: "lbs", increment: 5 });
    const thirty = toKg(30, "lbs");
    expect(fromKg(ladder.up(thirty), "lbs")).toBeCloseTo(35, 2);
    expect(fromKg(ladder.down(thirty), "lbs")).toBeCloseTo(25, 2);
  });

  it("prefers the rule of the gym over the default and mixes units", () => {
    const context = {
      defaultUnit: "kg" as const,
      rules: [{ equipment: "dumbbell" as const, unit: "lbs" as const, increment: 5, values: [] }],
      bar: null,
    };
    expect(ladderFor(["dumbbell", "bench"], context).unit).toBe("lbs");
    const barbell = ladderFor(["barbell", "rack"], context);
    expect(barbell.unit).toBe("kg");
    expect(barbell.incrementKg).toBe(2.5);
  });

  it("derives the barbell step from the smallest plate", () => {
    const context = { defaultUnit: "kg" as const, rules: [], bar: { ...KG_BAR, plates: [{ weight: 5, pairs: 4 }] } };
    expect(ladderFor(["barbell"], context).incrementKg).toBe(10);
    expect(usesPlates(["barbell", "rack"])).toBe(true);
    expect(usesPlates(["dumbbell"])).toBe(false);
  });

  it("reads a list of weights with decimal commas", () => {
    expect(parseWeightList("2 4 6,5 8")).toEqual([2, 4, 6.5, 8]);
    expect(parseWeightList("10, 12.5; 15  15 abc")).toEqual([10, 12.5, 15]);
    expect(parseWeightList("")).toEqual([]);
  });
});

describe("progression with custom steps", () => {
  const prescription = { sets: 2, repMin: 8, repMax: 10, targetRir: 2 };
  const done = [{ weightKg: 10, reps: 10, rir: 2 }];

  it("moves to the next available weight instead of adding a fixed increment", () => {
    const steps = createLadder({ unit: "kg", increment: 2, values: [8, 10, 12.5, 15] });
    const [target] = nextSetTargets({ exerciseType: "weight_reps", prescription, previous: done, incrementKg: 2, isDeload: false, steps });
    expect(target).toEqual({ weightKg: 12.5, reps: 8 });
  });

  it("holds the last values when asked not to progress", () => {
    const [target] = nextSetTargets({ exerciseType: "weight_reps", prescription, previous: done, incrementKg: 2, isDeload: false, hold: true });
    expect(target).toEqual({ weightKg: 10, reps: 10 });
  });

  it("starts lighter after a long break", () => {
    const previous = [{ weightKg: 100, reps: 9, rir: 2 }];
    const [target] = nextSetTargets({ exerciseType: "weight_reps", prescription, previous, incrementKg: 2.5, isDeload: false, weightFactor: 0.85 });
    expect(target).toEqual({ weightKg: 85, reps: 8 });
  });
});

describe("supersets and circuits", () => {
  const member = (id: string, groupId: string | null, completedSets: number, totalSets = 3) => ({ id, groupId, completedSets, totalSets });

  it("rests after every set of an ungrouped exercise", () => {
    expect(afterSetCompleted([member("a", null, 1)], "a")).toEqual({ rest: true, nextId: null });
  });

  it("moves on without rest until every exercise of the group finished the round", () => {
    expect(afterSetCompleted([member("a", "g", 1), member("b", "g", 0)], "a")).toEqual({ rest: false, nextId: "b" });
    expect(afterSetCompleted([member("a", "g", 1), member("b", "g", 1)], "b")).toEqual({ rest: true, nextId: null });
  });

  it("cycles through a circuit of three", () => {
    const afterFirst = [member("a", "g", 2), member("b", "g", 1), member("c", "g", 1)];
    expect(afterSetCompleted(afterFirst, "a").nextId).toBe("b");
    const afterSecond = [member("a", "g", 2), member("b", "g", 2), member("c", "g", 1)];
    expect(afterSetCompleted(afterSecond, "b").nextId).toBe("c");
    const afterThird = [member("a", "g", 2), member("b", "g", 2), member("c", "g", 2)];
    expect(afterSetCompleted(afterThird, "c").rest).toBe(true);
  });

  it("skips members that have no sets left", () => {
    const members = [member("a", "g", 3), member("b", "g", 2, 2)];
    expect(afterSetCompleted(members, "a")).toEqual({ rest: true, nextId: null });
  });

  it("groups neighbours and dissolves groups of one", () => {
    const items = [
      { id: 1, groupId: "x" },
      { id: 2, groupId: "x" },
      { id: 3, groupId: null },
      { id: 4, groupId: "x" },
    ];
    expect(groupConsecutive(items).map((group) => group.items.length)).toEqual([2, 1, 1]);
    expect(normalizeGroups(items).map((item) => item.groupId)).toEqual(["x", "x", null, null]);
    expect(groupKind(1)).toBeNull();
    expect(groupKind(2)).toBe("superset");
    expect(groupKind(4)).toBe("circuit");
    expect(groupRestSeconds([60, 150])).toBe(150);
  });
});

describe("plan builder state", () => {
  const item = (key: string, groupId: string | null = null): EditorItem => ({
    key,
    exerciseId: key,
    name: key,
    type: "weight_reps",
    sets: 3,
    repMin: 8,
    repMax: 12,
    targetRir: 2,
    restSeconds: 90,
    groupId,
  });

  it("reorders items", () => {
    expect(moveItem([item("a"), item("b"), item("c")], 2, 0).map((entry) => entry.key)).toEqual(["c", "a", "b"]);
    expect(moveItem([item("a"), item("b")], 0, 5).map((entry) => entry.key)).toEqual(["a", "b"]);
  });

  it("links two exercises and extends a group to a circuit", () => {
    let items = linkWithNext([item("a"), item("b"), item("c")], 0, "g1");
    expect(items.map((entry) => entry.groupId)).toEqual(["g1", "g1", null]);
    expect(isLinkedToNext(items, 0)).toBe(true);
    items = linkWithNext(items, 1, "g2");
    expect(items.map((entry) => entry.groupId)).toEqual(["g1", "g1", "g1"]);
  });

  it("unlinks and dissolves leftovers", () => {
    const linked = [item("a", "g"), item("b", "g"), item("c", "g")];
    expect(unlinkFromNext(linked, 0, "n").map((entry) => entry.groupId)).toEqual([null, "n", "n"]);
    expect(unlinkFromNext(linked, 1, "n").map((entry) => entry.groupId)).toEqual(["g", "g", null]);
  });

  it("breaks a group when a member is dragged away", () => {
    const moved = moveItem([item("a", "g"), item("b", "g"), item("c")], 0, 2);
    expect(moved.map((entry) => entry.groupId)).toEqual([null, null, null]);
  });
});

describe("adapting a planned day", () => {
  it("keeps exercises that fit", () => {
    const result = adaptDay([entry("barbell-bench-press")], lookup, EXERCISES, profile());
    expect(result.items[0].replaces).toBeNull();
    expect(result.dropped).toEqual([]);
  });

  it("replaces exercises the location cannot offer", () => {
    const day = [entry("barbell-bench-press"), entry("lat-pulldown"), entry("dumbbell-curl")];
    const result = adaptDay(day, lookup, EXERCISES, profile({ equipment: HOME }));
    for (const item of result.items) expect(isExerciseAvailable(item.exercise, HOME)).toBe(true);
    const bench = result.items[0];
    expect(bench.replaces?.id).toBe("barbell-bench-press");
    expect(bench.reason).toBe("equipment");
    expect(bench.exercise.primary).toContain("chest");
    expect(result.items.find((item) => item.entry.exerciseId === "dumbbell-curl")?.replaces).toBeNull();
    // Kein Ersatz doppelt.
    expect(new Set(result.items.map((item) => item.exercise.id)).size).toBe(result.items.length);
  });

  it("replaces excluded exercises and never picks another excluded one", () => {
    const excluded = ["barbell-bench-press", "dumbbell-bench-press"];
    const result = adaptDay([entry("barbell-bench-press")], lookup, EXERCISES, profile({ excludedExerciseIds: excluded }));
    expect(result.items[0].reason).toBe("excluded");
    expect(excluded).not.toContain(result.items[0].exercise.id);
  });

  it("avoids movement patterns of an injured region", () => {
    const avoided = avoidedPatterns(["knee"]);
    const result = adaptDay([entry("walking-lunge"), entry("leg-extension")], lookup, EXERCISES, profile({ injuries: ["knee"] }));
    for (const item of result.items) {
      expect(avoided.has(item.exercise.pattern)).toBe(false);
      expect(item.reason).toBe("injury");
    }
  });

  it("drops an exercise when nothing suitable is left", () => {
    const result = adaptDay([entry("lat-pulldown")], lookup, [lookup("lat-pulldown")!], profile({ equipment: [] }));
    expect(result.items).toEqual([]);
    expect(result.dropped[0]).toMatchObject({ reason: "equipment" });
  });

  it("keeps the prescription of the replaced exercise", () => {
    const result = adaptDay([entry("barbell-bench-press", { sets: 5, restSeconds: 200 })], lookup, EXERCISES, profile({ equipment: HOME }));
    expect(result.items[0].entry).toMatchObject({ sets: 5, restSeconds: 200 });
  });
});

describe("time saver", () => {
  const items = ["barbell-back-squat", "barbell-bench-press", "lat-pulldown", "dumbbell-curl", "triceps-pushdown", "leg-extension"].map(
    (id) => ({ entry: entry(id), exercise: lookup(id)! }),
  );

  it("is clearly shorter than the full session", () => {
    const full = estimateDaySeconds(items.map((item) => item.entry));
    const short = shortenDay(items);
    expect(estimateDaySeconds(short)).toBeLessThanOrEqual(full * 0.75);
    expect(short.length).toBeGreaterThanOrEqual(3);
    expect(short[0].exerciseId).toBe("barbell-back-squat");
    for (const item of short) expect(item.sets).toBe(2);
  });

  it("pairs neighbouring isolation exercises of different muscles as supersets", () => {
    const short = shortenDay(items, Number.POSITIVE_INFINITY);
    const curl = short.find((item) => item.exerciseId === "dumbbell-curl");
    const pushdown = short.find((item) => item.exerciseId === "triceps-pushdown");
    expect(curl?.groupId).not.toBeNull();
    expect(curl?.groupId).toBe(pushdown?.groupId);
    expect(short.find((item) => item.exerciseId === "barbell-back-squat")?.groupId).toBeNull();
  });

  it("never goes below two sets and keeps single sets", () => {
    const one = shortenDay([{ entry: entry("push-up", { sets: 1 }), exercise: lookup("push-up")! }], 0);
    expect(one[0].sets).toBe(1);
  });

  it("counts the rest only once per round of a superset", () => {
    const single = estimateDaySeconds([entry("a"), entry("b")]);
    const paired = estimateDaySeconds([entry("a", { groupId: "g" }), entry("b", { groupId: "g" })]);
    expect(paired).toBe(single - 2 * 90);
  });
});

describe("recovery-oriented day", () => {
  const all = (percent: number) => Object.fromEntries(MUSCLES.map((muscle) => [muscle, percent])) as Record<Muscle, number>;

  it("trains the fresh muscles and leaves the tired ones alone", () => {
    const recovery = { ...all(100), quads: 20, glutes: 20, hamstrings: 30, calves: 40, adductors: 30, abductors: 30 };
    const day = buildRecoveryDay(recovery, profile(), EXERCISES);
    expect(day.restRecommended).toBe(false);
    expect(day.exercises.length).toBeGreaterThanOrEqual(3);
    for (const planned of day.exercises) {
      expect(readiness(lookup(planned.exerciseId)!, recovery)).toBeGreaterThanOrEqual(70);
    }
    expect(day.focus.every((muscle) => recovery[muscle] === 100)).toBe(true);
  });

  it("recommends rest when nothing is recovered", () => {
    const day = buildRecoveryDay(all(30), profile(), EXERCISES);
    expect(day.restRecommended).toBe(true);
  });

  it("is deterministic and respects equipment", () => {
    const first = buildRecoveryDay(all(100), profile({ equipment: HOME }), EXERCISES);
    const second = buildRecoveryDay(all(100), profile({ equipment: HOME }), EXERCISES);
    expect(first).toEqual(second);
    for (const planned of first.exercises) expect(isExerciseAvailable(lookup(planned.exerciseId)!, HOME)).toBe(true);
  });
});

describe("learning generator, grip module and extra sports", () => {
  const firstExercise = (plan: ReturnType<typeof generatePlan>) => plan.days[0].exercises[0].exerciseId;

  it("stops suggesting an exercise that was rejected", () => {
    const base = generatePlan(profile(), EXERCISES);
    const rejected = firstExercise(base);
    const preferences = new Map<string, ExercisePreference>([[rejected, { usage: 0, rejections: 2 }]]);
    const learned = generatePlan(profile(), EXERCISES, { preferences });
    expect(learned.days.flatMap((day) => day.exercises.map((item) => item.exerciseId))).not.toContain(rejected);
    expect(lookup(firstExercise(learned))?.pattern).toBe(lookup(rejected)?.pattern);
  });

  it("keeps an exercise that is done regularly despite an old rejection", () => {
    const base = generatePlan(profile(), EXERCISES);
    const favourite = firstExercise(base);
    const preferences = new Map<string, ExercisePreference>([[favourite, { usage: 6, rejections: 3 }]]);
    expect(firstExercise(generatePlan(profile(), EXERCISES, { preferences }))).toBe(favourite);
  });

  it("stays deterministic with preferences", () => {
    const preferences = new Map<string, ExercisePreference>([["lat-pulldown", { usage: 5, rejections: 0 }]]);
    expect(generatePlan(profile(), EXERCISES, { preferences })).toEqual(generatePlan(profile(), EXERCISES, { preferences }));
  });

  it("adds grip work on two days when the module is on", () => {
    const isGrip = (id: string) => ["grip", "carry"].includes(lookup(id)?.pattern ?? "") || !!lookup(id)?.primary.includes("forearms");
    const countGrip = (plan: ReturnType<typeof generatePlan>) =>
      plan.days.filter((day) => day.exercises.some((item) => isGrip(item.exerciseId))).length;
    const without = generatePlan(profile(), EXERCISES);
    const withGrip = generatePlan(profile(), EXERCISES, { includeGrip: true });
    expect(countGrip(withGrip)).toBeGreaterThanOrEqual(2);
    expect(countGrip(withGrip)).toBeGreaterThan(countGrip(without));
  });

  it("skips grip work with a wrist complaint", () => {
    const plan = generatePlan(profile({ injuries: ["wrist"] }), EXERCISES, { includeGrip: true });
    expect(plan.days.flatMap((day) => day.exercises).some((item) => lookup(item.exerciseId)?.pattern === "grip")).toBe(false);
  });

  it("plans one set less for leg isolation work with a lot of leg-heavy sport", () => {
    const fourDays = profile({ weekdays: [1, 2, 4, 5], sessionMinutes: 90 });
    const normal = generatePlan(fourDays, EXERCISES);
    const sporty = generatePlan(fourDays, EXERCISES, { legSportSessions: 3 });
    const sets = (plan: typeof normal, id: string) => plan.days.flatMap((day) => day.exercises).find((item) => item.exerciseId === id)?.sets;
    const legIsolation = normal.days
      .flatMap((day) => day.exercises)
      .map((item) => lookup(item.exerciseId)!)
      .find((exercise) => exercise.mechanic === "isolation" && exercise.primary.every((muscle) => ["quads", "hamstrings", "calves"].includes(muscle)));
    expect(legIsolation).toBeDefined();
    expect(sets(sporty, legIsolation!.id)).toBe(Math.max(2, (sets(normal, legIsolation!.id) ?? 0) - 1));
    expect(sets(sporty, "barbell-bench-press")).toBe(sets(normal, "barbell-bench-press"));
    expect(generatePlan(fourDays, EXERCISES, { legSportSessions: 2 })).toEqual(normal);
  });
});

describe("cycle-based training", () => {
  it("estimates the phase from the calendar", () => {
    expect(cycleStatus("2026-11-01", 28, "2026-11-01")).toMatchObject({ day: 1, phase: "menstruation", rirOffset: 1, holdProgression: true });
    expect(cycleStatus("2026-11-01", 28, "2026-11-08")).toMatchObject({ day: 8, phase: "follicular", rirOffset: 0 });
    expect(cycleStatus("2026-11-01", 28, "2026-11-14")?.phase).toBe("ovulation");
    expect(cycleStatus("2026-11-01", 28, "2026-11-20")?.phase).toBe("luteal");
    expect(cycleStatus("2026-11-01", 28, "2026-11-26")).toMatchObject({ phase: "late_luteal", holdProgression: true });
  });

  it("repeats with the cycle length and ignores dates before the start", () => {
    expect(cycleStatus("2026-11-01", 28, "2026-11-29")?.day).toBe(1);
    expect(cycleStatus("2026-11-01", 30, "2026-11-30")?.day).toBe(30);
    expect(cycleStatus("2026-11-10", 28, "2026-11-01")).toBeNull();
  });
});

describe("vacation mode", () => {
  const pause: Vacation = { type: "pause", from: "2026-11-10", until: "2026-11-12", gymProfileId: null };

  it("is active only within its dates", () => {
    expect(isVacationActive(pause, "2026-11-09")).toBe(false);
    expect(isVacationActive(pause, "2026-11-10")).toBe(true);
    expect(isVacationActive(pause, "2026-11-12")).toBe(true);
    expect(isVacationActive(pause, "2026-11-13")).toBe(false);
    expect(isVacationActive(null, "2026-11-10")).toBe(false);
  });

  it("excuses pause days but not travel days", () => {
    expect([...pauseDates(pause)]).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(pauseDates({ ...pause, type: "travel" }).size).toBe(0);
  });

  it("does not break the streak or mark days as missed during a pause", () => {
    // Montag 9.11. trainiert, Mittwoch 11.11. im Urlaub, Freitag 13.11. ist heute.
    const done = new Set(["2026-11-09"]);
    expect(trainingStreak(done, [1, 3, 5], "2026-11-13")).toBe(0);
    expect(trainingStreak(done, [1, 3, 5], "2026-11-13", pauseDates(pause))).toBe(1);
    const schedule = { startDate: "2026-11-01", weekdays: [1, 3, 5] as const, pausedDates: pauseDates(pause) };
    expect(dayStatus("2026-11-11", done, schedule, "2026-11-13")).toBe("rest");
    expect(dayStatus("2026-11-06", done, schedule, "2026-11-13")).toBe("missed");
  });

  it("eases back in after a longer break", () => {
    expect(reentryFactor(null)).toBe(1);
    expect(reentryFactor(7)).toBe(1);
    expect(reentryFactor(14)).toBe(0.9);
    expect(reentryFactor(30)).toBe(0.85);
    expect(reentryFactor(90)).toBe(0.75);
  });
});
