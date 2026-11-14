import { cache } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UtensilsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trainingStreak } from "@/domain/training/schedule";
import { addDays, type LocalDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import { getDailyTotals, getDay } from "../services/diary-service";
import { ensureTarget, getRecommendedWater } from "../services/target-service";
import { DEFAULT_WATER_GOAL_ML, getWaterGoal, getWaterGoalDates, getWaterTotal } from "../services/tracking-service";
import { WaterCard } from "./water-card";

const STREAK_LOOKBACK_DAYS = 400;

/** Daten für die Ernährungs- und die Wasser-Kachel; pro Request nur einmal geladen. */
const loadToday = cache(async (userId: string, today: LocalDate) => {
  const db = getDb();
  const from = addDays(today, -STREAK_LOOKBACK_DAYS);
  const [target, day, waterTotal, waterGoalSetting, recommendedWater, totals] = await Promise.all([
    ensureTarget(db, userId, today),
    getDay(db, userId, today),
    getWaterTotal(db, userId, today),
    getWaterGoal(db, userId),
    getRecommendedWater(db, userId, today),
    getDailyTotals(db, userId, from, today),
  ]);
  const waterGoal = waterGoalSetting ?? recommendedWater ?? DEFAULT_WATER_GOAL_ML;
  const waterDates = await getWaterGoalDates(db, userId, from, today, waterGoal);
  return {
    target,
    day,
    waterTotal,
    waterGoal,
    // Ohne geplante Wochentage zählt jeder Tag: So entsteht ein täglicher Streak.
    nutritionStreak: trainingStreak(new Set(totals.map((row) => row.date)), [], today),
    waterStreak: trainingStreak(new Set(waterDates), [], today),
  };
});

/** Kachel „Ernährung“: Kalorien und Makros des Tages mit dem Streak. */
export async function NutritionWidget({ userId, today }: { userId: string; today: LocalDate }) {
  const t = await getTranslations("nutrition");
  const { target, day, nutritionStreak } = await loadToday(userId, today);
  const eaten = Math.round(day.total.kcal);
  const share = target && target.kcal > 0 ? Math.min(eaten / target.kcal, 1) : 0;
  return (
    <Card>
      <CardHeader>
        <CardDescription className="flex items-center gap-1.5">
          <UtensilsIcon className="size-4" aria-hidden />
          {t("home.title")}
        </CardDescription>
        <CardTitle className="text-2xl tabular-nums">
          {formatNumber(eaten, 0)}
          {target ? ` / ${formatNumber(target.kcal, 0)}` : ""} {t("units.kcal")}
        </CardTitle>
        <CardDescription className="tabular-nums">
          {t("macros.proteinShort")} {formatNumber(day.total.proteinG, 0)}
          {target ? ` / ${target.proteinG}` : ""} {t("units.g")}
          {" · "}
          {t("macros.carbsShort")} {formatNumber(day.total.carbsG, 0)}
          {target ? ` / ${target.carbsG}` : ""} {t("units.g")}
          {" · "}
          {t("macros.fatShort")} {formatNumber(day.total.fatG, 0)}
          {target ? ` / ${target.fatG}` : ""} {t("units.g")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="bg-secondary h-2 overflow-hidden rounded-full">
          <div className="bg-primary h-full rounded-full" style={{ width: `${share * 100}%` }} />
        </div>
        <p className="text-muted-foreground text-sm">{t("home.streakNutrition", { count: nutritionStreak })}</p>
        <Button asChild variant="outline" className="justify-self-start">
          <Link href="/nutrition">{t("home.open")}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Kachel „Wasser“: Tagesmenge mit Schnell-Buttons und dem Streak. */
export async function WaterWidget({ userId, today }: { userId: string; today: LocalDate }) {
  const t = await getTranslations("nutrition");
  const { waterTotal, waterGoal, waterStreak } = await loadToday(userId, today);
  return (
    <div className="grid gap-2">
      {/* Ohne Datum bucht der Server auf „heute“ zum Zeitpunkt des Klicks. */}
      <WaterCard date={null} totalMl={waterTotal} goalMl={waterGoal} />
      <p className="text-muted-foreground text-sm">{t("home.streakWater", { count: waterStreak })}</p>
    </div>
  );
}
