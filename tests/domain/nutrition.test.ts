import { describe, expect, it } from "vitest";
import {
  adaptiveTdee,
  isCheckInDue,
  trendChangeOver,
  weightSlopePerDay,
  weightTrend,
  type WeightPoint,
} from "@/domain/nutrition/adaptive";
import {
  basalMetabolicRate,
  estimateTdee,
  recommendedWaterMl,
  referenceWeightKg,
  targetsFromTdee,
  trainingKcalPerDay,
  type BodyData,
} from "@/domain/nutrition/energy";
import {
  allowedUnits,
  macrosForAmount,
  recipeAsPortionable,
  recipeShare,
  roundMacros,
  scaleIngredients,
  sumMacros,
  summarizeRecipe,
  type Portionable,
} from "@/domain/nutrition/macros";
import { addDays } from "@/lib/dates";

const man: BodyData = { sex: "male", ageYears: 30, heightCm: 180, weightKg: 80 };
const woman: BodyData = { sex: "female", ageYears: 30, heightCm: 165, weightKg: 60 };
const noTraining = { sessionsPerWeek: 0, sessionMinutes: 0 };

describe("energy needs", () => {
  it("calculates the basal metabolic rate with Mifflin-St-Jeor", () => {
    expect(basalMetabolicRate(man)).toBe(1780);
    expect(basalMetabolicRate(woman)).toBeCloseTo(1320.25, 2);
  });

  it("applies the activity factor and adds the training load", () => {
    expect(estimateTdee(man, "sedentary", noTraining)).toBeCloseTo(2136, 0);
    expect(trainingKcalPerDay(80, { sessionsPerWeek: 3, sessionMinutes: 60 })).toBeCloseTo(120, 0);
    const withTraining = estimateTdee(man, "light", { sessionsPerWeek: 3, sessionMinutes: 60 });
    expect(withTraining).toBeCloseTo(1780 * 1.375 + 120, 0);
  });

  it("adjusts calories to the goal", () => {
    expect(targetsFromTdee(2500, "maintain", man).kcal).toBe(2500);
    expect(targetsFromTdee(2500, "muscle_gain", man).kcal).toBe(2750);
    expect(targetsFromTdee(2500, "fat_loss", man).kcal).toBe(2000);
    expect(targetsFromTdee(2500, "recomposition", man).kcal).toBe(2380);
  });

  it("never drops below a safe minimum", () => {
    expect(targetsFromTdee(1500, "fat_loss", woman).kcal).toBe(1200);
    expect(targetsFromTdee(1700, "fat_loss", man).kcal).toBe(1500);
  });

  it("sets protein and fat by body weight and fills the rest with carbs", () => {
    const targets = targetsFromTdee(2500, "fat_loss", man);
    expect(targets.proteinG).toBe(176);
    expect(targets.fatG).toBe(72);
    expect(targets.carbsG).toBe(Math.round((2000 - 176 * 4 - 72 * 9) / 4));
    const energy = targets.proteinG * 4 + targets.carbsG * 4 + targets.fatG * 9;
    expect(Math.abs(energy - targets.kcal)).toBeLessThanOrEqual(4);
    expect(targets.tdeeKcal).toBe(2500);
  });

  it("keeps fat at a fifth of the calories at least", () => {
    const targets = targetsFromTdee(4000, "muscle_gain", { sex: "male", weightKg: 60, heightCm: 175 });
    expect(targets.fatG * 9).toBeGreaterThanOrEqual(targets.kcal * 0.2 - 9);
  });

  it("uses the weight at BMI 25 as reference when overweight", () => {
    expect(referenceWeightKg({ heightCm: 180, weightKg: 80 })).toBe(80);
    expect(referenceWeightKg({ heightCm: 165, weightKg: 120 })).toBeCloseTo(68.06, 2);
    expect(referenceWeightKg({ heightCm: 0, weightKg: 70 })).toBe(70);
  });

  it("keeps the macros within the calorie target for heavy people", () => {
    // Regressionsfall: Früher 264 g Eiweiß + 108 g Fett + 0 g KH = 2028 kcal bei 1890 kcal Ziel.
    const body: BodyData = { sex: "female", ageYears: 50, heightCm: 165, weightKg: 120 };
    const tdee = estimateTdee(body, "sedentary", { sessionsPerWeek: 3, sessionMinutes: 60 });
    const targets = targetsFromTdee(tdee, "fat_loss", body);
    expect(targets.kcal).toBe(1890);
    expect(targets.proteinG).toBe(150);
    expect(targets.fatG).toBe(61);
    expect(targets.carbsG).toBe(185);
  });

  it("always leaves room for carbs and matches the calories", () => {
    const sexes = ["male", "female"] as const;
    const goals = ["fat_loss", "muscle_gain", "recomposition", "maintain"] as const;
    for (const sex of sexes) {
      for (const goal of goals) {
        for (const heightCm of [150, 170, 200]) {
          for (const weightKg of [45, 80, 140, 200]) {
            for (const tdee of [1300, 2200, 4000]) {
              const targets = targetsFromTdee(tdee, goal, { sex, heightCm, weightKg });
              const energy = targets.proteinG * 4 + targets.carbsG * 4 + targets.fatG * 9;
              expect(Math.abs(energy - targets.kcal)).toBeLessThanOrEqual(6);
              expect(targets.carbsG * 4).toBeGreaterThanOrEqual(targets.kcal * 0.15 - 6);
              expect(targets.fatG * 9).toBeGreaterThanOrEqual(targets.kcal * 0.2 - 5);
              expect(targets.proteinG).toBeGreaterThan(0);
            }
          }
        }
      }
    }
  });

  it("lowers fat first and then protein when the calories are very low", () => {
    // 200 cm, 140 kg, Mindestkalorien: Eiweiß und Fett nach Gewicht würden 1690 kcal brauchen.
    const targets = targetsFromTdee(1700, "fat_loss", { sex: "male", heightCm: 200, weightKg: 140 });
    expect(targets.kcal).toBe(1500);
    expect(targets.proteinG).toBe(220);
    expect(targets.fatG).toBe(44);
    expect(targets.carbsG).toBe(56);
  });

  it("recommends water by body weight within sensible limits", () => {
    expect(recommendedWaterMl(80)).toBe(2750);
    expect(recommendedWaterMl(35)).toBe(1500);
    expect(recommendedWaterMl(200)).toBe(4500);
  });
});

describe("weight trend", () => {
  it("starts at the first measurement and smooths daily noise", () => {
    const points: WeightPoint[] = [
      { date: "2026-11-01", weightKg: 80 },
      { date: "2026-11-02", weightKg: 81 },
      { date: "2026-11-03", weightKg: 79 },
    ];
    const trend = weightTrend(points);
    expect(trend[0].trendKg).toBe(80);
    expect(trend[1].trendKg).toBeCloseTo(80.1, 5);
    expect(trend[2].trendKg).toBeCloseTo(79.99, 5);
  });

  it("gives more weight to a measurement after a gap", () => {
    const daily = weightTrend([
      { date: "2026-11-01", weightKg: 80 },
      { date: "2026-11-02", weightKg: 82 },
    ]);
    const afterGap = weightTrend([
      { date: "2026-11-01", weightKg: 80 },
      { date: "2026-11-11", weightKg: 82 },
    ]);
    expect(afterGap[1].trendKg).toBeGreaterThan(daily[1].trendKg);
    expect(afterGap[1].trendKg).toBeLessThan(82);
  });

  it("compares with the measurement nearest to 30 days ago", () => {
    const today = "2026-11-30";
    const trend = weightTrend([
      { date: "2026-09-01", weightKg: 90 },
      { date: "2026-10-27", weightKg: 85 },
      { date: "2026-11-02", weightKg: 84 },
      { date: "2026-11-29", weightKg: 82 },
    ]);
    const change = trendChangeOver(trend, today, 30, 7);
    expect(change?.from.date).toBe("2026-11-02");
    expect(change?.to.date).toBe("2026-11-29");
    expect(change?.changeKg).toBeCloseTo(trend[3].trendKg - trend[2].trendKg, 10);
  });

  it("shows no 30-day change without a measurement near that day", () => {
    const today = "2026-11-30";
    // Nur eine sehr alte und eine junge Messung: Der Zeitraum wäre nicht 30 Tage.
    const old = weightTrend([
      { date: "2026-06-01", weightKg: 90 },
      { date: "2026-11-29", weightKg: 82 },
    ]);
    expect(trendChangeOver(old, today, 30, 7)).toBeNull();
    // Erst seit zwei Wochen gewogen: früher fiel die Anzeige auf die erste Messung zurück.
    const young = weightTrend([
      { date: "2026-11-16", weightKg: 84 },
      { date: "2026-11-29", weightKg: 82 },
    ]);
    expect(trendChangeOver(young, today, 30, 7)).toBeNull();
    // Die jüngste Messung ist selbst zu alt.
    const stale = weightTrend([
      { date: "2026-10-31", weightKg: 84 },
      { date: "2026-11-10", weightKg: 82 },
    ]);
    expect(trendChangeOver(stale, today, 30, 7)).toBeNull();
    expect(trendChangeOver([], today, 30, 7)).toBeNull();
  });

  it("sorts measurements by date", () => {
    const trend = weightTrend([
      { date: "2026-11-03", weightKg: 79 },
      { date: "2026-11-01", weightKg: 80 },
    ]);
    expect(trend.map((point) => point.date)).toEqual(["2026-11-01", "2026-11-03"]);
  });
});

describe("adaptive energy expenditure", () => {
  const from = "2026-11-01";
  const to = "2026-11-21";
  const days = Array.from({ length: 21 }, (_, index) => addDays(from, index));
  /** Gleichmäßiger Gewichtsverlauf mit `kgPerWeek` Änderung, lange genug für einen stabilen Trend. */
  const weights = (kgPerWeek: number): WeightPoint[] =>
    Array.from({ length: 81 }, (_, index) => ({
      date: addDays(to, index - 80),
      weightKg: 80 + (kgPerWeek / 7) * (index - 80),
    }));

  it("equals the intake when the weight is stable", () => {
    const result = adaptiveTdee({
      intake: days.map((date) => ({ date, kcal: 2600 })),
      weights: weights(0),
      from,
      to,
      formulaTdeeKcal: 2400,
    });
    expect(result.tdeeKcal).toBe(2600);
    expect(result.confidence).toBe(1);
    expect(result.loggedDays).toBe(21);
  });

  it("is higher than the intake while losing weight", () => {
    const result = adaptiveTdee({
      intake: days.map((date) => ({ date, kcal: 2000 })),
      weights: weights(-0.5),
      from,
      to,
      formulaTdeeKcal: 2500,
    });
    // 0,5 kg pro Woche entsprechen 550 kcal pro Tag.
    expect(result.tdeeKcal).toBeGreaterThan(2450);
    expect(result.tdeeKcal).toBeLessThan(2600);
    expect(result.trendChangeKg).toBeLessThan(0);
  });

  it("measures the real expenditure without weights before the window", () => {
    // Regressionsfall: täglich wiegen, −0,5 kg/Woche, 2000 kcal, echter Verbrauch 2550 kcal.
    // Früher startete der Trend erst im Zeitraum, hinkte am Ende nach und ergab ~2333 kcal.
    const daily = days.map((date, index) => ({ date, weightKg: 90 - (0.5 / 7) * index }));
    const result = adaptiveTdee({
      intake: days.map((date) => ({ date, kcal: 2000 })),
      weights: daily,
      from,
      to,
      formulaTdeeKcal: 2500,
    });
    expect(result.confidence).toBe(1);
    expect(result.tdeeKcal).toBe(2550);
    expect(result.trendChangeKg).toBeCloseTo(-(0.5 / 7) * 20, 5);
  });

  it("stays close to the real expenditure with noisy daily weights", () => {
    const noise = [0.4, -0.3, 0.1, -0.5, 0.2, 0.3, -0.2];
    const noisy = days.map((date, index) => ({ date, weightKg: 90 - (0.5 / 7) * index + noise[index % noise.length] }));
    const result = adaptiveTdee({
      intake: days.map((date) => ({ date, kcal: 2000 })),
      weights: noisy,
      from,
      to,
      formulaTdeeKcal: 2500,
    });
    expect(Math.abs(result.tdeeKcal - 2550)).toBeLessThan(120);
  });

  it("ignores weights outside the window and needs a week between measurements", () => {
    const outside = [
      { date: addDays(from, -30), weightKg: 100 },
      { date: addDays(to, 3), weightKg: 60 },
    ];
    const stable = days.map((date) => ({ date, weightKg: 80 }));
    const result = adaptiveTdee({
      intake: days.map((date) => ({ date, kcal: 2600 })),
      weights: [...outside, ...stable],
      from,
      to,
      formulaTdeeKcal: 2400,
    });
    expect(result.tdeeKcal).toBe(2600);
    const shortSpan = adaptiveTdee({
      intake: days.map((date) => ({ date, kcal: 2600 })),
      weights: stable.slice(0, 5),
      from,
      to,
      formulaTdeeKcal: 2400,
    });
    expect(shortSpan).toMatchObject({ tdeeKcal: 2400, confidence: 0, trendChangeKg: null });
  });

  it("fits the weight change per day as a straight line", () => {
    expect(weightSlopePerDay([])).toBeNull();
    expect(weightSlopePerDay([{ date: from, weightKg: 80 }, { date: from, weightKg: 81 }])).toBeNull();
    const slope = weightSlopePerDay([
      { date: from, weightKg: 80 },
      { date: addDays(from, 10), weightKg: 79 },
    ]);
    expect(slope).toBeCloseTo(-0.1, 10);
  });

  it("falls back to the formula without enough data", () => {
    const fewDays = adaptiveTdee({
      intake: days.slice(0, 3).map((date) => ({ date, kcal: 2000 })),
      weights: weights(0),
      from,
      to,
      formulaTdeeKcal: 2500,
    });
    expect(fewDays).toMatchObject({ tdeeKcal: 2500, confidence: 0 });
    const noWeights = adaptiveTdee({
      intake: days.map((date) => ({ date, kcal: 2000 })),
      weights: [],
      from,
      to,
      formulaTdeeKcal: 2500,
    });
    expect(noWeights).toMatchObject({ tdeeKcal: 2500, confidence: 0, trendChangeKg: null });
  });

  it("ignores days that were obviously logged only in part", () => {
    const intake = days.map((date, index) => ({ date, kcal: index % 2 === 0 ? 2600 : 300 }));
    const result = adaptiveTdee({ intake, weights: weights(0), from, to, formulaTdeeKcal: 2600 });
    expect(result.avgIntakeKcal).toBe(2600);
    expect(result.loggedDays).toBe(11);
  });

  it("trusts sparse data less and stays near the formula", () => {
    const intake = days.filter((_, index) => index % 4 === 0).map((date) => ({ date, kcal: 3200 }));
    const result = adaptiveTdee({ intake, weights: weights(0), from, to, formulaTdeeKcal: 2400 });
    expect(result.confidence).toBeLessThan(0.4);
    expect(result.tdeeKcal).toBeLessThan(2700);
    expect(result.tdeeKcal).toBeGreaterThan(2400);
  });

  it("limits implausible results", () => {
    const result = adaptiveTdee({
      intake: days.map((date) => ({ date, kcal: 6000 })),
      weights: weights(0),
      from,
      to,
      formulaTdeeKcal: 2400,
    });
    expect(result.tdeeKcal).toBe(Math.round(2400 * 1.35));
  });

  it("is due once the current target is a week old", () => {
    expect(isCheckInDue("2026-11-01", "2026-11-07")).toBe(false);
    expect(isCheckInDue("2026-11-01", "2026-11-08")).toBe(true);
  });
});

describe("macros", () => {
  const oats: Portionable = {
    basis: "g",
    per: { kcal: 370, proteinG: 13, carbsG: 59, fatG: 7 },
    servingSize: 50,
  };
  const bar: Portionable = {
    basis: "serving",
    per: { kcal: 200, proteinG: 20, carbsG: 15, fatG: 7 },
    servingSize: null,
  };

  it("scales values to grams and servings", () => {
    const scaled = macrosForAmount(oats, 80, "g");
    expect(scaled && roundMacros(scaled)).toEqual({ kcal: 296, proteinG: 10.4, carbsG: 47.2, fatG: 5.6 });
    expect(macrosForAmount(oats, 2, "serving")?.kcal).toBe(370);
    expect(macrosForAmount(bar, 1.5, "serving")?.kcal).toBe(300);
  });

  it("rejects units that do not fit the food", () => {
    expect(macrosForAmount(bar, 50, "g")).toBeNull();
    expect(macrosForAmount(oats, 100, "ml")).toBeNull();
    expect(macrosForAmount({ ...oats, servingSize: null }, 1, "serving")).toBeNull();
    expect(macrosForAmount(oats, -5, "g")).toBeNull();
  });

  it("offers only the units that make sense", () => {
    expect(allowedUnits(oats)).toEqual(["g", "serving"]);
    expect(allowedUnits({ basis: "ml", servingSize: null })).toEqual(["ml"]);
    expect(allowedUnits(bar)).toEqual(["serving"]);
  });

  it("sums and rounds", () => {
    const total = sumMacros([
      { kcal: 100.4, proteinG: 1.25, carbsG: 2, fatG: 3 },
      { kcal: 50.2, proteinG: 1.25, carbsG: 2, fatG: 3 },
    ]);
    expect(roundMacros(total)).toEqual({ kcal: 151, proteinG: 2.5, carbsG: 4, fatG: 6 });
  });

  it("summarises a recipe per serving and per 100 g", () => {
    const summary = summarizeRecipe(
      [
        { amount: 200, amountUnit: "g", kcal: 740, proteinG: 26, carbsG: 118, fatG: 14 },
        { amount: 300, amountUnit: "ml", kcal: 141, proteinG: 10, carbsG: 14.4, fatG: 4.5 },
      ],
      2,
    );
    expect(summary.total.kcal).toBe(881);
    expect(summary.perServing.kcal).toBe(440.5);
    expect(summary.totalWeightG).toBe(500);
    const asFood = recipeAsPortionable(summary, 2);
    expect(asFood.basis).toBe("g");
    expect(asFood.per.kcal).toBeCloseTo(176.2, 1);
    expect(asFood.servingSize).toBe(250);
  });

  it("falls back to servings when an ingredient has no weight", () => {
    const summary = summarizeRecipe(
      [
        { amount: 100, amountUnit: "g", kcal: 370, proteinG: 13, carbsG: 59, fatG: 7 },
        { amount: 1, amountUnit: "serving", kcal: 200, proteinG: 20, carbsG: 15, fatG: 7 },
      ],
      1,
    );
    expect(summary.totalWeightG).toBeNull();
    expect(recipeAsPortionable(summary, 1)).toMatchObject({ basis: "serving", servingSize: null });
  });

  it("uses the serving weight of ingredients added by servings", () => {
    // Regressionsfall: 1 Ei (M, 60 g) + 10 g Butter ließ sich nur nach Portionen eintragen.
    const summary = summarizeRecipe(
      [
        { amount: 1, amountUnit: "serving", servingWeightG: 60, kcal: 93, proteinG: 7.5, carbsG: 0.5, fatG: 6.5 },
        { amount: 10, amountUnit: "g", kcal: 74, proteinG: 0.1, carbsG: 0.1, fatG: 8.3 },
      ],
      1,
    );
    expect(summary.totalWeightG).toBe(70);
    const asFood = recipeAsPortionable(summary, 1);
    expect(asFood.basis).toBe("g");
    expect(macrosForAmount(asFood, 35, "g")?.kcal).toBeCloseTo(83.5, 5);
  });

  it("works out which share of a recipe an amount is and scales the ingredients", () => {
    const ingredients = [
      { amount: 200, amountUnit: "g" as const, kcal: 740, proteinG: 26, carbsG: 118, fatG: 14 },
      { amount: 300, amountUnit: "ml" as const, kcal: 141, proteinG: 10, carbsG: 14.4, fatG: 4.5 },
    ];
    const summary = summarizeRecipe(ingredients, 2);
    expect(recipeShare(summary, 2, 1, "serving")).toBe(0.5);
    expect(recipeShare(summary, 2, 125, "g")).toBe(0.25);
    expect(recipeShare({ ...summary, totalWeightG: null }, 2, 125, "g")).toBeNull();
    expect(recipeShare(summary, 2, -1, "serving")).toBeNull();
    const half = scaleIngredients(ingredients, 0.5);
    expect(half.map((item) => item.amount)).toEqual([100, 150]);
    expect(sumMacros(half).kcal).toBeCloseTo(440.5, 5);
  });
});
