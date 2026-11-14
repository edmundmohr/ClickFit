import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { UtensilsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trainingStreak } from "@/domain/training/schedule";
import type { AppDatabase } from "@/db/client";
import { addDays, type LocalDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { getDailyTotals, getDay } from "../services/diary-service";
import { ensureTarget, getRecommendedWater } from "../services/target-service";
import { DEFAULT_WATER_GOAL_ML, getWaterGoal, getWaterGoalDates, getWaterTotal } from "../services/tracking-service";
import { WaterCard } from "./water-card";

const STREAK_LOOKBACK_DAYS = 400;

/** Ernährung auf der Heute-Seite: Kalorien und Makros, Wasser und die beiden Streaks. */
export async function TodayNutrition({ db, userId, today }: { db: AppDatabase; userId: string; today: LocalDate }) {
  const t = await getTranslations("nutrition");
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
  // Ohne geplante Wochentage zählt jeder Tag: So entsteht ein täglicher Streak.
  const nutritionStreak = trainingStreak(new Set(totals.map((row) => row.date)), [], today);
  const waterStreak = trainingStreak(new Set(waterDates), [], today);

  const eaten = Math.round(day.total.kcal);
  const share = target && target.kcal > 0 ? Math.min(eaten / target.kcal, 1) : 0;

  return (
    <>
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
          <p className="text-muted-foreground text-sm">
            {t("home.streakNutrition", { count: nutritionStreak })}
            {" · "}
            {t("home.streakWater", { count: waterStreak })}
          </p>
          <Button asChild variant="outline" className="justify-self-start">
            <Link href="/nutrition">{t("home.open")}</Link>
          </Button>
        </CardContent>
      </Card>
      <WaterCard date={today} totalMl={waterTotal} goalMl={waterGoal} />
    </>
  );
}
