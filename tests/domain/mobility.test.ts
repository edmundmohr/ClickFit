import { describe, expect, it } from "vitest";
import {
  MEDICAL_NOTE,
  MOBILITY_EXERCISES,
  MOBILITY_EXERCISES_BY_ID,
  MOBILITY_ROUTINES,
  MOBILITY_ROUTINES_BY_ID,
} from "@/data/mobility";
import {
  INITIAL_PLAYER_STATE,
  playerElapsedSeconds,
  playerRemainingSeconds,
  reducePlayer,
  type PlayerEvent,
  type PlayerState,
  type PlayerStepTiming,
} from "@/domain/mobility/player";
import {
  DEFAULT_REP_SECONDS,
  STEP_SWITCH_SECONDS,
  expandRoutine,
  filterRoutines,
  routineDurationSeconds,
  summarizeRoutine,
} from "@/domain/mobility/routines";
import { mobilityStreak } from "@/domain/mobility/streak";
import {
  MOBILITY_COMPLAINTS,
  MOBILITY_LEVELS,
  MOBILITY_REGIONS,
  PAIN_COMPLAINTS,
  type MobilityExercise,
  type MobilityRoutine,
  type MobilityRoutineSummary,
} from "@/domain/mobility/types";

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const hold: MobilityExercise = {
  id: "hold",
  name: "Halten",
  regions: ["hips"],
  perSide: false,
  durationSeconds: 30,
  instructions: ["Halten."],
};
const sideHold: MobilityExercise = { ...hold, id: "side-hold", name: "Seitlich halten", perSide: true };
const reps: MobilityExercise = {
  id: "reps",
  name: "Wiederholen",
  regions: ["neck"],
  perSide: false,
  reps: 10,
  instructions: ["Wiederholen."],
};
const slowSideReps: MobilityExercise = { ...reps, id: "slow-side-reps", perSide: true, reps: 5, repSeconds: 8 };
const lookup = new Map([hold, sideHold, reps, slowSideReps].map((exercise) => [exercise.id, exercise]));

function routine(items: MobilityRoutine["items"], overrides: Partial<MobilityRoutine> = {}): MobilityRoutine {
  return {
    id: "test",
    name: "Test",
    description: "Test",
    regions: ["hips"],
    complaints: [],
    level: "easy",
    items,
    ...overrides,
  };
}

describe("expandRoutine", () => {
  it("turns a per-side exercise into a left and a right step", () => {
    const steps = expandRoutine(routine([{ exerciseId: "hold" }, { exerciseId: "side-hold" }]), lookup);
    expect(steps.map((step) => [step.exercise.id, step.side])).toEqual([
      ["hold", null],
      ["side-hold", "left"],
      ["side-hold", "right"],
    ]);
  });

  it("uses the dose of the exercise unless the routine overrides it", () => {
    const steps = expandRoutine(
      routine([
        { exerciseId: "hold" },
        { exerciseId: "hold", durationSeconds: 45 },
        { exerciseId: "reps" },
        { exerciseId: "reps", reps: 6 },
      ]),
      lookup,
    );
    expect(steps.map((step) => [step.durationSeconds, step.reps])).toEqual([
      [30, null],
      [45, null],
      [null, 10],
      [null, 6],
    ]);
  });

  it("estimates repetitions with the default or the exercise's own pace", () => {
    const steps = expandRoutine(routine([{ exerciseId: "reps" }, { exerciseId: "slow-side-reps" }]), lookup);
    expect(steps.map((step) => step.estimatedSeconds)).toEqual([10 * DEFAULT_REP_SECONDS, 40, 40]);
  });

  it("rejects a routine that points to an unknown exercise", () => {
    expect(() => expandRoutine(routine([{ exerciseId: "missing" }]), lookup)).toThrow(/missing/);
  });
});

describe("routineDurationSeconds", () => {
  it("counts sides twice and adds a switch between steps", () => {
    const plan = routine([{ exerciseId: "hold" }, { exerciseId: "side-hold" }, { exerciseId: "reps" }]);
    // 30 + 2 × 30 + 10 × 4 = 130 s Übung, vier Schritte = drei Wechsel.
    expect(routineDurationSeconds(plan, lookup)).toBe(130 + 3 * STEP_SWITCH_SECONDS);
  });

  it("needs no switch for a single step and is zero for an empty routine", () => {
    expect(routineDurationSeconds(routine([{ exerciseId: "hold" }]), lookup)).toBe(30);
    expect(routineDurationSeconds(routine([]), lookup)).toBe(0);
  });

  it("matches the summary", () => {
    const plan = routine([{ exerciseId: "side-hold" }, { exerciseId: "reps" }]);
    const summary = summarizeRoutine(plan, lookup);
    expect(summary.stepCount).toBe(3);
    expect(summary.durationSeconds).toBe(routineDurationSeconds(plan, lookup));
  });
});

describe("filterRoutines", () => {
  type Sample = Pick<MobilityRoutineSummary, "id" | "regions" | "complaints" | "durationSeconds">;
  const hipsShort: Sample = { id: "hips-short", regions: ["hips"], complaints: ["tight_hips"], durationSeconds: 300 };
  const hipsLong: Sample = { id: "hips-long", regions: ["hips", "lower_back"], complaints: [], durationSeconds: 600 };
  const backFirst: Sample = {
    id: "back-first",
    regions: ["lower_back", "hips"],
    complaints: ["lower_back_pain", "tight_hips"],
    durationSeconds: 200,
  };
  const neck: Sample = { id: "neck", regions: ["neck"], complaints: ["neck_tension"], durationSeconds: 100 };
  const all = [hipsLong, backFirst, neck, hipsShort];
  const ids = (list: readonly { id: string }[]) => list.map((item) => item.id);

  it("returns everything sorted by duration without a filter", () => {
    expect(ids(filterRoutines(all, {}))).toEqual(["neck", "back-first", "hips-short", "hips-long"]);
    expect(ids(filterRoutines(all, { region: null, complaint: null }))).toHaveLength(4);
  });

  it("puts routines with the region as focus first, then sorts by duration", () => {
    expect(ids(filterRoutines(all, { region: "hips" }))).toEqual(["hips-short", "hips-long", "back-first"]);
  });

  it("filters by complaint", () => {
    expect(ids(filterRoutines(all, { complaint: "tight_hips" }))).toEqual(["hips-short", "back-first"]);
    expect(filterRoutines(all, { complaint: "post_leg_day" })).toEqual([]);
  });

  it("requires both when region and complaint are set and ranks by combined fit", () => {
    expect(ids(filterRoutines(all, { region: "hips", complaint: "tight_hips" }))).toEqual(["hips-short", "back-first"]);
    expect(ids(filterRoutines(all, { region: "lower_back", complaint: "lower_back_pain" }))).toEqual(["back-first"]);
    expect(filterRoutines(all, { region: "neck", complaint: "tight_hips" })).toEqual([]);
  });

  it("does not change the input", () => {
    const before = ids(all);
    filterRoutines(all, { region: "hips" });
    expect(ids(all)).toEqual(before);
  });
});

describe("mobilityStreak", () => {
  const today = "2026-11-16";

  it("is zero without entries", () => {
    expect(mobilityStreak([], today)).toBe(0);
  });

  it("counts consecutive days up to today", () => {
    expect(mobilityStreak(["2026-11-16", "2026-11-15", "2026-11-14"], today)).toBe(3);
  });

  it("does not treat today as a gap while the day is still running", () => {
    expect(mobilityStreak(["2026-11-15", "2026-11-14"], today)).toBe(2);
  });

  it("ends at the first missed day", () => {
    expect(mobilityStreak(["2026-11-16", "2026-11-14", "2026-11-13"], today)).toBe(1);
    expect(mobilityStreak(["2026-11-14", "2026-11-13"], today)).toBe(0);
  });

  it("counts a day once and ignores future entries", () => {
    expect(mobilityStreak(["2026-11-16", "2026-11-16", "2026-11-15", "2026-11-17"], today)).toBe(2);
  });

  it("crosses month and year boundaries", () => {
    expect(mobilityStreak(["2026-12-31", "2027-01-01"], "2027-01-01")).toBe(2);
  });
});

describe("reducePlayer", () => {
  const timings: PlayerStepTiming[] = [{ durationSeconds: 30 }, { durationSeconds: null }, { durationSeconds: 20 }];
  const switchMs = STEP_SWITCH_SECONDS * 1000;
  const play = (events: PlayerEvent[], from: PlayerState = INITIAL_PLAYER_STATE) =>
    events.reduce((state, event) => reducePlayer(state, event, timings), from);

  it("starts with the switch time and then counts down the exercise", () => {
    const prepared = play([{ type: "start", now: 1000 }]);
    expect(prepared).toMatchObject({ status: "running", index: 0, phase: "prepare" });
    expect(playerRemainingSeconds(prepared)).toBe(STEP_SWITCH_SECONDS);

    const working = play([{ type: "tick", now: 1000 + switchMs }], prepared);
    expect(working).toMatchObject({ index: 0, phase: "work", signals: 0 });
    expect(playerRemainingSeconds(working)).toBe(30);
    expect(playerRemainingSeconds(play([{ type: "tick", now: 1000 + switchMs + 10_400 }], working))).toBe(20);
  });

  it("moves on automatically, signals once and waits at repetition steps", () => {
    const afterFirst = play([
      { type: "start", now: 0 },
      { type: "tick", now: switchMs },
      { type: "tick", now: switchMs + 30_000 },
    ]);
    expect(afterFirst).toMatchObject({ index: 1, phase: "prepare", signals: 1 });

    const atReps = play([{ type: "tick", now: 2 * switchMs + 30_000 }], afterFirst);
    expect(atReps).toMatchObject({ index: 1, phase: "work", endsAt: null });
    expect(playerRemainingSeconds(atReps)).toBeNull();
    // Ohne Countdown passiert nichts, bis „Fertig“ getippt wird.
    const later = play([{ type: "tick", now: 500_000 }], atReps);
    expect(later).toMatchObject({ index: 1, phase: "work", signals: 1 });
    expect(play([{ type: "next", now: 500_000 }], later)).toMatchObject({ index: 2, phase: "prepare", signals: 1 });
  });

  it("keeps the remaining time across a pause and does not count the pause as active time", () => {
    const paused = play([
      { type: "start", now: 0 },
      { type: "tick", now: switchMs },
      { type: "pause", now: switchMs + 12_000 },
    ]);
    expect(paused).toMatchObject({ status: "paused", endsAt: null });
    expect(playerRemainingSeconds(paused)).toBe(18);
    expect(play([{ type: "tick", now: 900_000 }], paused)).toBe(paused);

    const resumed = play([{ type: "start", now: 1_000_000 }], paused);
    expect(resumed.status).toBe("running");
    expect(playerRemainingSeconds(resumed)).toBe(18);
    expect(playerElapsedSeconds(play([{ type: "tick", now: 1_003_000 }], resumed))).toBe(20);
  });

  it("steps back and forth without leaving the routine at the start", () => {
    const second = play([
      { type: "start", now: 0 },
      { type: "next", now: 100 },
    ]);
    expect(second).toMatchObject({ index: 1, phase: "prepare" });
    const first = play([{ type: "previous", now: 200 }], second);
    expect(first).toMatchObject({ index: 0, phase: "prepare" });
    expect(play([{ type: "previous", now: 300 }], first)).toMatchObject({ index: 0, phase: "prepare" });
  });

  it("prepares the switch time when stepping while paused", () => {
    const paused = play([
      { type: "start", now: 0 },
      { type: "pause", now: 1000 },
      { type: "next", now: 2000 },
    ]);
    expect(paused).toMatchObject({ status: "paused", index: 1, endsAt: null });
    expect(playerRemainingSeconds(paused)).toBe(STEP_SWITCH_SECONDS);
  });

  it("finishes after the last step and reports the active time", () => {
    const finished = play([
      { type: "start", now: 0 },
      { type: "next", now: 10_000 },
      { type: "next", now: 20_000 },
      { type: "tick", now: 20_000 + switchMs },
      { type: "tick", now: 40_000 + switchMs },
    ]);
    expect(finished).toMatchObject({ status: "finished", signals: 1, endsAt: null });
    expect(playerElapsedSeconds(finished)).toBe(45);
    expect(play([{ type: "next", now: 99_000 }], finished)).toBe(finished);
    expect(play([{ type: "reset" }], finished)).toEqual(INITIAL_PLAYER_STATE);
  });

  it("ignores events that do not fit the state", () => {
    expect(play([{ type: "tick", now: 5 }])).toBe(INITIAL_PLAYER_STATE);
    expect(play([{ type: "next", now: 5 }])).toBe(INITIAL_PLAYER_STATE);
    expect(play([{ type: "pause", now: 5 }])).toBe(INITIAL_PLAYER_STATE);
    expect(reducePlayer(INITIAL_PLAYER_STATE, { type: "start", now: 5 }, [])).toBe(INITIAL_PLAYER_STATE);
  });
});

describe("mobility catalogue", () => {
  it("has unique kebab-case ids", () => {
    for (const list of [MOBILITY_EXERCISES, MOBILITY_ROUTINES]) {
      const ids = list.map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id, id).toMatch(KEBAB_CASE);
    }
    expect(MOBILITY_EXERCISES_BY_ID.size).toBe(MOBILITY_EXERCISES.length);
    expect(MOBILITY_ROUTINES_BY_ID.size).toBe(MOBILITY_ROUTINES.length);
  });

  it("has the expected size", () => {
    expect(MOBILITY_EXERCISES.length).toBeGreaterThanOrEqual(45);
    expect(MOBILITY_EXERCISES.length).toBeLessThanOrEqual(60);
    expect(MOBILITY_ROUTINES.length).toBeGreaterThanOrEqual(14);
    expect(MOBILITY_ROUTINES.length).toBeLessThanOrEqual(18);
  });

  it("gives every exercise a name, valid regions, instructions and exactly one dose", () => {
    const names = new Set<string>();
    for (const exercise of MOBILITY_EXERCISES) {
      expect(exercise.name.trim(), exercise.id).not.toBe("");
      expect(names.has(exercise.name), exercise.id).toBe(false);
      names.add(exercise.name);
      expect(exercise.regions.length, exercise.id).toBeGreaterThan(0);
      expect(new Set(exercise.regions).size, exercise.id).toBe(exercise.regions.length);
      for (const region of exercise.regions) expect(MOBILITY_REGIONS, exercise.id).toContain(region);
      expect(exercise.instructions.length, exercise.id).toBeGreaterThanOrEqual(2);
      for (const step of exercise.instructions) expect(step.trim().length, exercise.id).toBeGreaterThan(10);
      expect(new Set(exercise.instructions).size, exercise.id).toBe(exercise.instructions.length);
      if (exercise.hint !== undefined) expect(exercise.hint.trim(), exercise.id).not.toBe("");

      const timed = exercise.durationSeconds !== undefined;
      expect(timed !== (exercise.reps !== undefined), exercise.id).toBe(true);
      if (timed) {
        expect(exercise.durationSeconds, exercise.id).toBeGreaterThanOrEqual(15);
        expect(exercise.durationSeconds, exercise.id).toBeLessThanOrEqual(120);
      } else {
        expect(exercise.reps, exercise.id).toBeGreaterThanOrEqual(3);
        expect(exercise.reps, exercise.id).toBeLessThanOrEqual(20);
      }
    }
  });

  it("uses every exercise in at least one routine", () => {
    const used = new Set(MOBILITY_ROUTINES.flatMap((item) => item.items.map((entry) => entry.exerciseId)));
    for (const exercise of MOBILITY_EXERCISES) expect(used.has(exercise.id), exercise.id).toBe(true);
  });

  it("lets routines refer only to existing exercises, with overrides that fit the exercise", () => {
    for (const item of MOBILITY_ROUTINES) {
      const ids = item.items.map((entry) => entry.exerciseId);
      expect(new Set(ids).size, item.id).toBe(ids.length);
      for (const entry of item.items) {
        const exercise = MOBILITY_EXERCISES_BY_ID.get(entry.exerciseId);
        expect(exercise, `${item.id}: ${entry.exerciseId}`).toBeDefined();
        if (!exercise) continue;
        // Eine Haltezeit passt nur zu gehaltenen Übungen, Wiederholungen nur zu wiederholten.
        if (entry.durationSeconds !== undefined) expect(exercise.durationSeconds, entry.exerciseId).toBeDefined();
        if (entry.reps !== undefined) expect(exercise.reps, entry.exerciseId).toBeDefined();
      }
    }
  });

  it("describes every routine with valid regions, complaints and level", () => {
    for (const item of MOBILITY_ROUTINES) {
      expect(item.name.trim(), item.id).not.toBe("");
      expect(item.description.trim().length, item.id).toBeGreaterThan(20);
      expect(item.regions.length, item.id).toBeGreaterThan(0);
      expect(new Set(item.regions).size, item.id).toBe(item.regions.length);
      expect(new Set(item.complaints).size, item.id).toBe(item.complaints.length);
      for (const region of item.regions) expect(MOBILITY_REGIONS, item.id).toContain(region);
      for (const complaint of item.complaints) expect(MOBILITY_COMPLAINTS, item.id).toContain(complaint);
      expect(MOBILITY_LEVELS, item.id).toContain(item.level);
      expect(item.items.length, item.id).toBeGreaterThanOrEqual(4);
    }
  });

  it("covers every region and every complaint with at least one routine", () => {
    const summaries = MOBILITY_ROUTINES.map((item) => summarizeRoutine(item, MOBILITY_EXERCISES_BY_ID));
    for (const region of MOBILITY_REGIONS) {
      expect(filterRoutines(summaries, { region }).length, region).toBeGreaterThan(0);
    }
    for (const complaint of MOBILITY_COMPLAINTS) {
      expect(MOBILITY_ROUTINES.some((item) => item.complaints.includes(complaint)), complaint).toBe(true);
    }
  });

  it("only lists regions that the routine's exercises actually address", () => {
    for (const item of MOBILITY_ROUTINES) {
      const addressed = new Set(
        item.items.flatMap((entry) => MOBILITY_EXERCISES_BY_ID.get(entry.exerciseId)?.regions ?? []),
      );
      for (const region of item.regions) {
        if (region === "full_body") continue;
        expect(addressed.has(region), `${item.id}: ${region}`).toBe(true);
      }
    }
  });

  it("keeps every routine between 3 and 25 minutes", () => {
    for (const item of MOBILITY_ROUTINES) {
      const seconds = routineDurationSeconds(item, MOBILITY_EXERCISES_BY_ID);
      expect(seconds, item.id).toBeGreaterThanOrEqual(3 * 60);
      expect(seconds, item.id).toBeLessThanOrEqual(25 * 60);
    }
  });

  it("keeps the promise of routines that name their length", () => {
    for (const item of MOBILITY_ROUTINES) {
      const promised = /(\d+) Minuten/.exec(item.name);
      if (!promised) continue;
      const minutes = routineDurationSeconds(item, MOBILITY_EXERCISES_BY_ID) / 60;
      expect(Math.abs(minutes - Number(promised[1])), item.id).toBeLessThanOrEqual(1);
    }
  });

  it("adds the medical note to routines aimed at pain or tension", () => {
    for (const item of MOBILITY_ROUTINES) {
      if (!item.complaints.some((complaint) => PAIN_COMPLAINTS.includes(complaint))) continue;
      expect(item.description, item.id).toContain(MEDICAL_NOTE);
    }
  });
});
