import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/features/auth/session";
import { CheckInCard } from "@/features/nutrition/components/check-in-card";
import { DateNav } from "@/features/nutrition/components/date-nav";
import { MacroSummary } from "@/features/nutrition/components/macro-summary";
import { MealCard } from "@/features/nutrition/components/meal-card";
import { SupplementsCard } from "@/features/nutrition/components/supplements-card";
import { WaterCard } from "@/features/nutrition/components/water-card";
import { WeightCard } from "@/features/nutrition/components/weight-card";
import { getDay } from "@/features/nutrition/services/diary-service";
import { ensureTarget, getCheckIn, getCurrentTarget, getRecommendedWater } from "@/features/nutrition/services/target-service";
import {
  DEFAULT_WATER_GOAL_ML,
  getWaterGoal,
  getWaterTotal,
  getWeightStatus,
  listSupplements,
} from "@/features/nutrition/services/tracking-service";
import { OnboardingPrompt } from "@/features/training/components/onboarding-prompt";
import { MEALS } from "@/domain/nutrition/types";
import { addDays, isValidLocalDate, toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nutrition");
  return { title: t("title") };
}

const WEIGHT_LOOKBACK_DAYS = 90;

export default async function NutritionPage({ searchParams }: PageProps<"/nutrition">) {
  const user = await requireUser();
  const t = await getTranslations("nutrition");
  const today = toLocalDate(new Date());
  const params = await searchParams;
  const date = typeof params.date === "string" && isValidLocalDate(params.date) ? params.date : today;
  const isToday = date === today;
  // Gewicht und Wasser lassen sich nicht für kommende Tage eintragen.
  const isFuture = date > today;
  const db = getDb();

  // Das Ziel für heute wird bei Bedarf einmalig aus dem Profil berechnet; ohne Profil gibt es keins.
  // Ob ein Profil fehlt, hängt daher nicht vom angezeigten Tag ab. Tage vor dem ersten Ziel
  // zeigen keine Zielwerte.
  const todayTarget = await ensureTarget(db, user.id, today);
  const target = isToday ? todayTarget : await getCurrentTarget(db, user.id, date);
  const [day, waterTotal, waterGoal, recommendedWater, supplements, weight, checkIn] = await Promise.all([
    getDay(db, user.id, date),
    getWaterTotal(db, user.id, date),
    getWaterGoal(db, user.id),
    getRecommendedWater(db, user.id, today),
    listSupplements(db, user.id, date),
    getWeightStatus(db, user.id, addDays(date, -WEIGHT_LOOKBACK_DAYS), date),
    isToday ? getCheckIn(db, user.id, today) : null,
  ]);

  return (
    <>
      <DateNav date={date} today={today} />
      <div className="grid gap-4">
        <MacroSummary total={day.total} target={target} />
        {todayTarget ? null : (
          <OnboardingPrompt title={t("noProfile.title")} text={t("noProfile.text")} action={t("noProfile.action")} />
        )}
        {checkIn?.due ? <CheckInCard checkIn={checkIn} unitSystem={user.unitSystem} compact /> : null}
        {MEALS.map((meal) => (
          <MealCard key={meal} date={date} meal={meal} entries={day.meals[meal]} />
        ))}
        {isFuture ? null : (
          <WaterCard date={date} totalMl={waterTotal} goalMl={waterGoal ?? recommendedWater ?? DEFAULT_WATER_GOAL_ML} />
        )}
        <SupplementsCard date={date} supplements={supplements} />
        {isFuture ? null : (
          <WeightCard key={`${date}-${weight.today}`} date={date} status={weight} unitSystem={user.unitSystem} />
        )}
      </div>
    </>
  );
}
