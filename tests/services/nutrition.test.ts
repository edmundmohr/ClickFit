import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { food } from "@/db/schema";
import { EQUIPMENT } from "@/domain/exercises/types";
import { AppError } from "@/lib/errors";
import { addDays } from "@/lib/dates";
import { createUserWithPassword } from "@/features/auth/services/user-factory";
import { RECIPE_PREFIX, SNAPSHOT_PREFIX } from "@/features/nutrition/food-catalog";
import type { CustomFoodInput } from "@/features/nutrition/schemas";
import {
  addLogEntry,
  copyMeal,
  deleteLogEntry,
  getDailyTotals,
  getDay,
  getSuggestions,
  updateLogAmount,
} from "@/features/nutrition/services/diary-service";
import {
  createCustomFood,
  deleteCustomFood,
  findFoodByBarcode,
  getFood,
  listCustomFoods,
  searchLocalFoods,
} from "@/features/nutrition/services/food-service";
import { addPlanEntry, applyPlanDay, deletePlanEntry, getPlanDay } from "@/features/nutrition/services/meal-plan-service";
import {
  addRecipeIngredient,
  createRecipe,
  createRecipeFromMeal,
  deleteRecipe,
  getRecipe,
  listRecipes,
} from "@/features/nutrition/services/recipe-service";
import {
  applyCheckIn,
  ensureTarget,
  getCheckIn,
  getCurrentTarget,
  setManualTarget,
} from "@/features/nutrition/services/target-service";
import {
  addSupplement,
  addWater,
  deleteSupplement,
  getWaterGoal,
  getWaterGoalDates,
  getWaterTotal,
  deleteWeight,
  getWeightEntries,
  getWeightStatus,
  listSupplements,
  saveWeight,
  setSupplementTaken,
  setWaterGoal,
  undoLastWater,
} from "@/features/nutrition/services/tracking-service";
import { resolveTrackingDate } from "@/features/nutrition/tracking-date";
import type { OnboardingInput } from "@/features/training/schemas";
import { saveOnboarding } from "@/features/training/services/profile-service";
import { newId } from "@/lib/tokens";
import { TEST_PASSWORDS, createTestDatabase, type TestDatabase } from "../helpers/test-db";

const TODAY = "2026-11-16";
const OATS = "basic:oats-rolled";

const onboarding: OnboardingInput = {
  goal: "fat_loss",
  experience: "intermediate",
  weekdays: [1, 3, 5],
  sessionMinutes: 60,
  locationType: "gym",
  equipment: [...EQUIPMENT],
  cardio: { wanted: false, types: [], sessionsPerWeek: 0 },
  sex: "male",
  birthYear: 1996,
  heightCm: 180,
  weightKg: 80,
  activityLevel: "light",
  injuries: [],
  injuryNote: "",
  excludedExerciseIds: [],
};

const quark: CustomFoodInput = {
  name: "Mein Quark",
  brand: "Hofladen",
  basis: "g",
  kcal: 70,
  proteinG: 12,
  carbsG: 4,
  fatG: 0.3,
  servingSize: 250,
  servingLabel: "1 Becher",
  barcode: "4000000000017",
};

let testDb: TestDatabase;
let annaId: string;
let eddiId: string;

async function expectAppError(promise: Promise<unknown>, code: string): Promise<void> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(AppError);
  expect((error as AppError).code).toBe(code);
}

beforeAll(async () => {
  testDb = await createTestDatabase();
});

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.reset();
  await testDb.db.delete(food);
  const { db } = testDb;
  annaId = (await createUserWithPassword(db, { username: "Anna", password: TEST_PASSWORDS.anna, role: "user" })).id;
  eddiId = (await createUserWithPassword(db, { username: "Eddi", password: TEST_PASSWORDS.eddi, role: "user" })).id;
});

describe("foods", () => {
  it("finds built-in foods and resolves them by reference", async () => {
    const results = await searchLocalFoods(testDb.db, annaId, "haferflocken");
    expect(results.map((item) => item.ref)).toContain(OATS);
    expect((await getFood(testDb.db, annaId, OATS))?.source).toBe("basic");
    expect(await getFood(testDb.db, annaId, "basic:does-not-exist")).toBeNull();
  });

  it("keeps custom foods private to their owner", async () => {
    const id = await createCustomFood(testDb.db, annaId, quark);
    expect((await listCustomFoods(testDb.db, annaId)).map((item) => item.name)).toEqual(["Mein Quark"]);
    expect((await searchLocalFoods(testDb.db, annaId, "quark hof"))[0]).toMatchObject({ ref: id, source: "custom" });
    expect(await getFood(testDb.db, eddiId, id)).toBeNull();
    expect(await listCustomFoods(testDb.db, eddiId)).toEqual([]);
    expect((await searchLocalFoods(testDb.db, eddiId, "Mein Quark")).map((item) => item.ref)).not.toContain(id);
    await expectAppError(deleteCustomFood(testDb.db, eddiId, id), "NOT_FOUND");
    await deleteCustomFood(testDb.db, annaId, id);
    expect(await getFood(testDb.db, annaId, id)).toBeNull();
  });

  it("finds an own food by its barcode without asking the network", async () => {
    const id = await createCustomFood(testDb.db, annaId, quark);
    expect((await findFoodByBarcode(testDb.db, annaId, quark.barcode))?.ref).toBe(id);
  });

  it("shares cached Open Food Facts products between users", async () => {
    const id = newId();
    const now = new Date();
    await testDb.db.insert(food).values({
      id,
      source: "off",
      ownerId: null,
      barcode: "4000000000024",
      name: "Proteinriegel Schoko",
      brand: "Marke",
      basis: "g",
      kcal: 380,
      proteinG: 30,
      carbsG: 35,
      fatG: 12,
      servingSize: 50,
      servingLabel: "1 Riegel",
      createdAt: now,
      updatedAt: now,
    });
    for (const userId of [annaId, eddiId]) {
      expect((await searchLocalFoods(testDb.db, userId, "proteinriegel schoko")).map((item) => item.ref)).toContain(id);
      expect((await findFoodByBarcode(testDb.db, userId, "4000000000024"))?.ref).toBe(id);
    }
  });
});

describe("diary", () => {
  it("logs foods with calculated macros and sums the day", async () => {
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "breakfast", foodRef: OATS, amount: 80, amountUnit: "g" });
    const quarkId = await createCustomFood(testDb.db, annaId, quark);
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "breakfast", foodRef: quarkId, amount: 1, amountUnit: "serving" });
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "dinner", foodRef: OATS, amount: 50, amountUnit: "g" });

    const day = await getDay(testDb.db, annaId, TODAY);
    expect(day.meals.breakfast.map((entry) => entry.name)).toEqual(["Haferflocken", "Mein Quark (Hofladen)"]);
    expect(day.meals.breakfast[1].kcal).toBeCloseTo(175, 5);
    expect(day.meals.dinner).toHaveLength(1);
    expect(day.meals.lunch).toEqual([]);
    const oats = await getFood(testDb.db, annaId, OATS);
    expect(day.total.kcal).toBeCloseTo((oats?.per.kcal ?? 0) * 1.3 + 175, 5);
    expect((await getDay(testDb.db, eddiId, TODAY)).total.kcal).toBe(0);
  });

  it("rejects unknown foods and units that do not fit", async () => {
    const entry = { date: TODAY, meal: "lunch" as const, amount: 100 };
    await expectAppError(addLogEntry(testDb.db, annaId, { ...entry, foodRef: "missing", amountUnit: "g" }), "NOT_FOUND");
    await expectAppError(addLogEntry(testDb.db, annaId, { ...entry, foodRef: OATS, amountUnit: "ml" }), "VALIDATION");
  });

  it("scales the stored macros when the amount changes", async () => {
    const id = await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "lunch", foodRef: OATS, amount: 100, amountUnit: "g" });
    const before = (await getDay(testDb.db, annaId, TODAY)).meals.lunch[0];
    await updateLogAmount(testDb.db, annaId, id, 50);
    const after = (await getDay(testDb.db, annaId, TODAY)).meals.lunch[0];
    expect(after.amount).toBe(50);
    expect(after.kcal).toBeCloseTo(before.kcal / 2, 5);
    expect(after.proteinG).toBeCloseTo(before.proteinG / 2, 5);
  });

  it("protects entries of other users", async () => {
    const id = await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "lunch", foodRef: OATS, amount: 100, amountUnit: "g" });
    await expectAppError(updateLogAmount(testDb.db, eddiId, id, 10), "NOT_FOUND");
    await expectAppError(deleteLogEntry(testDb.db, eddiId, id), "NOT_FOUND");
    await deleteLogEntry(testDb.db, annaId, id);
    expect((await getDay(testDb.db, annaId, TODAY)).meals.lunch).toEqual([]);
  });

  it("copies a meal from another day", async () => {
    const yesterday = addDays(TODAY, -1);
    await addLogEntry(testDb.db, annaId, { date: yesterday, meal: "breakfast", foodRef: OATS, amount: 80, amountUnit: "g" });
    await addLogEntry(testDb.db, annaId, { date: yesterday, meal: "lunch", foodRef: OATS, amount: 30, amountUnit: "g" });
    expect(await copyMeal(testDb.db, annaId, { fromDate: yesterday, toDate: TODAY, meal: "breakfast" })).toBe(1);
    expect(await copyMeal(testDb.db, annaId, { fromDate: yesterday, toDate: TODAY, meal: "dinner" })).toBe(0);
    const day = await getDay(testDb.db, annaId, TODAY);
    expect(day.meals.breakfast[0]).toMatchObject({ name: "Haferflocken", amount: 80 });
    expect(day.meals.lunch).toEqual([]);
    expect((await getDay(testDb.db, annaId, yesterday)).meals.breakfast).toHaveLength(1);
  });

  it("suggests recent and frequent foods with the last amount", async () => {
    const quarkId = await createCustomFood(testDb.db, annaId, quark);
    await addLogEntry(testDb.db, annaId, { date: addDays(TODAY, -2), meal: "breakfast", foodRef: OATS, amount: 60, amountUnit: "g" });
    await addLogEntry(testDb.db, annaId, { date: addDays(TODAY, -1), meal: "breakfast", foodRef: OATS, amount: 90, amountUnit: "g" });
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "snack", foodRef: quarkId, amount: 1, amountUnit: "serving" });
    const { recent, frequent } = await getSuggestions(testDb.db, annaId);
    expect(recent.map((item) => item.foodRef)).toEqual([quarkId, OATS]);
    expect(recent[1]).toMatchObject({ amount: 90, amountUnit: "g" });
    expect(frequent.map((item) => item.foodRef)).toEqual([OATS]);
    expect((await getSuggestions(testDb.db, eddiId)).recent).toEqual([]);
  });

  it("sums calories per day", async () => {
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "lunch", foodRef: OATS, amount: 100, amountUnit: "g" });
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "dinner", foodRef: OATS, amount: 100, amountUnit: "g" });
    await addLogEntry(testDb.db, annaId, { date: addDays(TODAY, -3), meal: "dinner", foodRef: OATS, amount: 50, amountUnit: "g" });
    const totals = await getDailyTotals(testDb.db, annaId, addDays(TODAY, -7), TODAY);
    expect(totals.map((row) => row.date)).toEqual([addDays(TODAY, -3), TODAY]);
    expect(totals[1].kcal).toBeCloseTo(totals[0].kcal * 4, 5);
  });
});

describe("recipes and weekly plan", () => {
  it("builds a recipe and logs it by servings or grams", async () => {
    const recipeId = await createRecipe(testDb.db, annaId, { name: "Porridge", servings: 2 });
    const oats = await getFood(testDb.db, annaId, OATS);
    await addRecipeIngredient(testDb.db, annaId, recipeId, {
      foodRef: OATS,
      name: "Haferflocken",
      amount: 200,
      amountUnit: "g",
      kcal: (oats?.per.kcal ?? 0) * 2,
      proteinG: (oats?.per.proteinG ?? 0) * 2,
      carbsG: (oats?.per.carbsG ?? 0) * 2,
      fatG: (oats?.per.fatG ?? 0) * 2,
    });
    const view = await getRecipe(testDb.db, annaId, recipeId);
    expect(view.summary.totalWeightG).toBe(200);
    expect(view.summary.perServing.kcal).toBeCloseTo(oats?.per.kcal ?? 0, 5);

    const ref = `${RECIPE_PREFIX}${recipeId}`;
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "breakfast", foodRef: ref, amount: 1, amountUnit: "serving" });
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "snack", foodRef: ref, amount: 50, amountUnit: "g" });
    const day = await getDay(testDb.db, annaId, TODAY);
    expect(day.meals.breakfast[0].kcal).toBeCloseTo(oats?.per.kcal ?? 0, 5);
    expect(day.meals.snack[0].kcal).toBeCloseTo((oats?.per.kcal ?? 0) / 2, 5);

    expect(await getFood(testDb.db, eddiId, ref)).toBeNull();
    await expectAppError(getRecipe(testDb.db, eddiId, recipeId), "NOT_FOUND");
    await expectAppError(deleteRecipe(testDb.db, eddiId, recipeId), "NOT_FOUND");
  });

  it("saves a logged meal as a recipe", async () => {
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "lunch", foodRef: OATS, amount: 80, amountUnit: "g" });
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "lunch", foodRef: OATS, amount: 20, amountUnit: "g" });
    const recipeId = await createRecipeFromMeal(testDb.db, annaId, { date: TODAY, meal: "lunch", name: "Mittag" });
    const [recipe] = await listRecipes(testDb.db, annaId);
    expect(recipe).toMatchObject({ id: recipeId, name: "Mittag", servings: 1 });
    expect(recipe.ingredients.map((item) => item.amount)).toEqual([80, 20]);
    await expectAppError(createRecipeFromMeal(testDb.db, annaId, { date: TODAY, meal: "dinner", name: "Leer" }), "NOT_FOUND");
  });

  it("knows the weight of a recipe with ingredients added by servings", async () => {
    // Regressionsfall: 1 Ei (60 g) + 10 g Butter ließ sich nur nach Portionen eintragen.
    const recipeId = await createRecipe(testDb.db, annaId, { name: "Rührei", servings: 1 });
    for (const input of [
      { foodRef: "basic:egg-whole", amount: 1, amountUnit: "serving" as const },
      { foodRef: "basic:butter", amount: 10, amountUnit: "g" as const },
    ]) {
      const item = await getFood(testDb.db, annaId, input.foodRef);
      const factor = input.amountUnit === "serving" ? 0.6 : 0.1;
      await addRecipeIngredient(testDb.db, annaId, recipeId, {
        ...input,
        name: item?.name ?? "",
        kcal: (item?.per.kcal ?? 0) * factor,
        proteinG: (item?.per.proteinG ?? 0) * factor,
        carbsG: (item?.per.carbsG ?? 0) * factor,
        fatG: (item?.per.fatG ?? 0) * factor,
      });
    }
    const view = await getRecipe(testDb.db, annaId, recipeId);
    expect(view.summary.totalWeightG).toBe(70);
    const asFood = await getFood(testDb.db, annaId, `${RECIPE_PREFIX}${recipeId}`);
    expect(asFood).toMatchObject({ basis: "g", servingSize: 70 });
    await addLogEntry(testDb.db, annaId, {
      date: TODAY,
      meal: "breakfast",
      foodRef: `${RECIPE_PREFIX}${recipeId}`,
      amount: 35,
      amountUnit: "g",
    });
    expect((await getDay(testDb.db, annaId, TODAY)).total.kcal).toBeCloseTo(view.summary.total.kcal / 2, 5);
  });

  it("does not put a recipe into a recipe", async () => {
    const outer = await createRecipe(testDb.db, annaId, { name: "Außen", servings: 1 });
    const inner = await createRecipe(testDb.db, annaId, { name: "Innen", servings: 1 });
    const input = { foodRef: `${RECIPE_PREFIX}${inner}`, name: "Innen", amount: 1, amountUnit: "serving" as const };
    await expectAppError(
      addRecipeIngredient(testDb.db, annaId, outer, { ...input, kcal: 100, proteinG: 1, carbsG: 1, fatG: 1 }),
      "VALIDATION",
    );
    expect((await getRecipe(testDb.db, annaId, outer)).ingredients).toEqual([]);
  });

  it("resolves a logged recipe into its ingredients when saving a meal", async () => {
    const porridge = await createRecipe(testDb.db, annaId, { name: "Porridge", servings: 2 });
    const oats = await getFood(testDb.db, annaId, OATS);
    await addRecipeIngredient(testDb.db, annaId, porridge, {
      foodRef: OATS,
      name: "Haferflocken",
      amount: 200,
      amountUnit: "g",
      kcal: (oats?.per.kcal ?? 0) * 2,
      proteinG: (oats?.per.proteinG ?? 0) * 2,
      carbsG: (oats?.per.carbsG ?? 0) * 2,
      fatG: (oats?.per.fatG ?? 0) * 2,
    });
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "lunch", foodRef: `${RECIPE_PREFIX}${porridge}`, amount: 1, amountUnit: "serving" });
    await addLogEntry(testDb.db, annaId, { date: TODAY, meal: "lunch", foodRef: OATS, amount: 20, amountUnit: "g" });
    const lunch = (await getDay(testDb.db, annaId, TODAY)).meals.lunch;
    const lunchKcal = lunch.reduce((sum, entry) => sum + entry.kcal, 0);

    const fromMeal = await createRecipeFromMeal(testDb.db, annaId, { date: TODAY, meal: "lunch", name: "Mittag" });
    const resolved = await getRecipe(testDb.db, annaId, fromMeal);
    expect(resolved.ingredients.map((item) => [item.foodRef, item.amount])).toEqual([
      [OATS, 100],
      [OATS, 20],
    ]);
    expect(resolved.summary.total.kcal).toBeCloseTo(lunchKcal, 5);

    // Ist das Rezept gelöscht, bleibt der Eintrag als Momentaufnahme ohne Rezeptverweis erhalten.
    await deleteRecipe(testDb.db, annaId, porridge);
    const snapshot = await getRecipe(
      testDb.db,
      annaId,
      await createRecipeFromMeal(testDb.db, annaId, { date: TODAY, meal: "lunch", name: "Mittag 2" }),
    );
    expect(snapshot.ingredients[0]).toMatchObject({ foodRef: `${SNAPSHOT_PREFIX}${porridge}`, amount: 1, amountUnit: "serving" });
    expect(snapshot.ingredients.some((item) => item.foodRef.startsWith(RECIPE_PREFIX))).toBe(false);
    expect(snapshot.summary.total.kcal).toBeCloseTo(lunchKcal, 5);
  });

  it("plans a weekday and copies it into the diary", async () => {
    await addPlanEntry(testDb.db, annaId, { weekday: 1, meal: "breakfast", foodRef: OATS, amount: 80, amountUnit: "g" });
    await addPlanEntry(testDb.db, annaId, { weekday: 1, meal: "dinner", foodRef: OATS, amount: 40, amountUnit: "g" });
    await addPlanEntry(testDb.db, annaId, { weekday: 2, meal: "lunch", foodRef: OATS, amount: 10, amountUnit: "g" });
    const monday = await getPlanDay(testDb.db, annaId, 1);
    expect(monday.meals.breakfast).toHaveLength(1);
    expect(monday.meals.dinner).toHaveLength(1);
    expect((await getPlanDay(testDb.db, eddiId, 1)).total.kcal).toBe(0);

    expect(await applyPlanDay(testDb.db, annaId, 1, TODAY)).toBe(2);
    const day = await getDay(testDb.db, annaId, TODAY);
    expect(day.total.kcal).toBeCloseTo(monday.total.kcal, 5);

    await expectAppError(deletePlanEntry(testDb.db, eddiId, monday.meals.breakfast[0].id), "NOT_FOUND");
    await deletePlanEntry(testDb.db, annaId, monday.meals.breakfast[0].id);
    expect((await getPlanDay(testDb.db, annaId, 1)).meals.breakfast).toEqual([]);
  });
});

describe("targets and check-in", () => {
  it("has no target without a profile", async () => {
    expect(await ensureTarget(testDb.db, annaId, TODAY)).toBeNull();
    expect(await getCheckIn(testDb.db, annaId, TODAY)).toBeNull();
  });

  it("derives the first target from the profile exactly once", async () => {
    await saveOnboarding(testDb.db, annaId, onboarding);
    const first = await ensureTarget(testDb.db, annaId, TODAY);
    // Grundumsatz 1780 × 1,375 + 120 kcal Training ≈ 2568; Fettabbau −20 %.
    expect(first).toMatchObject({ source: "formula", kcal: 2050, proteinG: 176, startDate: TODAY });
    expect(first?.tdeeKcal).toBe(2568);
    const second = await ensureTarget(testDb.db, annaId, addDays(TODAY, 1));
    expect(second?.startDate).toBe(TODAY);
    expect(await getCurrentTarget(testDb.db, eddiId, TODAY)).toBeNull();
  });

  it("lets the user override the target manually", async () => {
    await saveOnboarding(testDb.db, annaId, onboarding);
    await ensureTarget(testDb.db, annaId, TODAY);
    await setManualTarget(testDb.db, annaId, TODAY, { kcal: 2222, proteinG: 150, carbsG: 250, fatG: 70 });
    expect(await getCurrentTarget(testDb.db, annaId, TODAY)).toMatchObject({ kcal: 2222, source: "manual", tdeeKcal: null });
  });

  it("proposes adapted targets from intake and weight trend after a week", async () => {
    await saveOnboarding(testDb.db, annaId, onboarding);
    const start = addDays(TODAY, -21);
    await ensureTarget(testDb.db, annaId, start);
    // Drei Wochen lang 3000 kcal bei stabilem Gewicht: Der Verbrauch liegt über der Formel.
    for (let offset = 21; offset >= 1; offset--) {
      const date = addDays(TODAY, -offset);
      await addLogEntry(testDb.db, annaId, { date, meal: "lunch", foodRef: "basic:olive-oil", amount: 339.4, amountUnit: "g" });
      await saveWeight(testDb.db, annaId, date, 80);
    }
    const checkIn = await getCheckIn(testDb.db, annaId, TODAY);
    expect(checkIn?.due).toBe(true);
    expect(checkIn?.analysis.loggedDays).toBe(21);
    expect(checkIn?.analysis.confidence).toBe(1);
    expect(checkIn?.analysis.tdeeKcal).toBeGreaterThan(2900);
    expect(checkIn?.proposal.kcal).toBeGreaterThan(2050);

    await applyCheckIn(testDb.db, annaId, TODAY);
    const target = await getCurrentTarget(testDb.db, annaId, TODAY);
    expect(target).toMatchObject({ source: "adaptive", startDate: TODAY, kcal: checkIn?.proposal.kcal });
    expect((await getCheckIn(testDb.db, annaId, TODAY))?.due).toBe(false);
  });
});

describe("water, supplements and weight", () => {
  it("tracks water with undo and a personal goal", async () => {
    expect(await getWaterTotal(testDb.db, annaId, TODAY)).toBe(0);
    await addWater(testDb.db, annaId, TODAY, 250);
    await addWater(testDb.db, annaId, TODAY, 500);
    await addWater(testDb.db, eddiId, TODAY, 330);
    expect(await getWaterTotal(testDb.db, annaId, TODAY)).toBe(750);
    await undoLastWater(testDb.db, annaId, TODAY);
    expect(await getWaterTotal(testDb.db, annaId, TODAY)).toBe(250);
    expect(await getWaterTotal(testDb.db, eddiId, TODAY)).toBe(330);

    expect(await getWaterGoal(testDb.db, annaId)).toBeNull();
    await setWaterGoal(testDb.db, annaId, 3000);
    await setWaterGoal(testDb.db, annaId, 200);
    expect(await getWaterGoal(testDb.db, annaId)).toBe(200);
    expect(await getWaterGoalDates(testDb.db, annaId, TODAY, TODAY, 200)).toEqual([TODAY]);
    expect(await getWaterGoalDates(testDb.db, annaId, TODAY, TODAY, 2000)).toEqual([]);
  });

  it("ticks supplements per day and keeps them private", async () => {
    await addSupplement(testDb.db, annaId, { name: "Kreatin", dose: "5 g", timing: "any" });
    const [creatine] = await listSupplements(testDb.db, annaId, TODAY);
    expect(creatine).toMatchObject({ name: "Kreatin", dose: "5 g", taken: false });
    await setSupplementTaken(testDb.db, annaId, creatine.id, TODAY, true);
    await setSupplementTaken(testDb.db, annaId, creatine.id, TODAY, true);
    expect((await listSupplements(testDb.db, annaId, TODAY))[0].taken).toBe(true);
    expect((await listSupplements(testDb.db, annaId, addDays(TODAY, 1)))[0].taken).toBe(false);
    await setSupplementTaken(testDb.db, annaId, creatine.id, TODAY, false);
    expect((await listSupplements(testDb.db, annaId, TODAY))[0].taken).toBe(false);

    expect(await listSupplements(testDb.db, eddiId, TODAY)).toEqual([]);
    await expectAppError(setSupplementTaken(testDb.db, eddiId, creatine.id, TODAY, true), "NOT_FOUND");
    await expectAppError(deleteSupplement(testDb.db, eddiId, creatine.id), "NOT_FOUND");
    await deleteSupplement(testDb.db, annaId, creatine.id);
    expect(await listSupplements(testDb.db, annaId, TODAY)).toEqual([]);
  });

  it("books weight and water only for today or earlier", () => {
    // Regressionsfall: Gewicht und Wasser ließen sich für kommende Tage speichern; ohne Datum
    // (Heute-Seite) gilt der Tag zum Zeitpunkt der Aktion.
    expect(resolveTrackingDate(null, TODAY)).toBe(TODAY);
    expect(resolveTrackingDate(undefined, TODAY)).toBe(TODAY);
    expect(resolveTrackingDate(addDays(TODAY, -3), TODAY)).toBe(addDays(TODAY, -3));
    expect(resolveTrackingDate(addDays(TODAY, 1), TODAY)).toBeNull();
    expect(resolveTrackingDate("2026-02-30", TODAY)).toBeNull();
    expect(resolveTrackingDate(42, TODAY)).toBeNull();
  });

  it("stores one weight per day and reports the trend", async () => {
    await saveWeight(testDb.db, annaId, addDays(TODAY, -1), 80);
    await saveWeight(testDb.db, annaId, TODAY, 82);
    await saveWeight(testDb.db, annaId, TODAY, 81);
    await saveWeight(testDb.db, eddiId, TODAY, 95);
    const status = await getWeightStatus(testDb.db, annaId, addDays(TODAY, -30), TODAY);
    expect(status.today).toBe(81);
    expect(status.latest?.trendKg).toBeCloseTo(80.1, 5);
    const yesterday = await getWeightStatus(testDb.db, annaId, addDays(TODAY, -30), addDays(TODAY, -1));
    expect(yesterday).toMatchObject({ today: 80 });
  });

  it("lists, backfills and deletes weights per user", async () => {
    await saveWeight(testDb.db, annaId, addDays(TODAY, -40), 84);
    await saveWeight(testDb.db, annaId, addDays(TODAY, -2), 82);
    await saveWeight(testDb.db, eddiId, addDays(TODAY, -2), 95);

    const all = await getWeightEntries(testDb.db, annaId, null, TODAY);
    expect(all.map((entry) => entry.date)).toEqual([addDays(TODAY, -40), addDays(TODAY, -2)]);
    expect(all.every((entry) => entry.source === "manual")).toBe(true);
    expect(await getWeightEntries(testDb.db, annaId, addDays(TODAY, -29), TODAY)).toHaveLength(1);

    // Nachtragen am selben Tag ersetzt den alten Wert.
    await saveWeight(testDb.db, annaId, addDays(TODAY, -40), 83.5);
    expect((await getWeightEntries(testDb.db, annaId, null, addDays(TODAY, -30)))[0].weightKg).toBe(83.5);

    await deleteWeight(testDb.db, annaId, addDays(TODAY, -2));
    expect(await getWeightEntries(testDb.db, annaId, null, TODAY)).toHaveLength(1);
    // Fremde und fehlende Einträge bleiben unberührt.
    await expectAppError(deleteWeight(testDb.db, annaId, addDays(TODAY, -2)), "NOT_FOUND");
    expect(await getWeightEntries(testDb.db, eddiId, null, TODAY)).toHaveLength(1);
  });
});
