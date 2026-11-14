import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { CheckInCard } from "@/features/nutrition/components/check-in-card";
import { DeleteSupplementButton, SupplementForm, TargetForm, WaterGoalForm } from "@/features/nutrition/components/target-forms";
import { ensureTarget, getCheckIn, getRecommendedWater } from "@/features/nutrition/services/target-service";
import { DEFAULT_WATER_GOAL_ML, getWaterGoal, listSupplements } from "@/features/nutrition/services/tracking-service";
import { OnboardingPrompt } from "@/features/training/components/onboarding-prompt";
import { toLocalDate } from "@/lib/dates";
import { formatDayLong, formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nutrition.targets");
  return { title: t("title") };
}

export default async function TargetsPage() {
  const user = await requireUser();
  const t = await getTranslations("nutrition");
  const today = toLocalDate(new Date());
  const db = getDb();
  const target = await ensureTarget(db, user.id, today);
  const [checkIn, waterGoal, recommendedWater, supplements] = await Promise.all([
    getCheckIn(db, user.id, today),
    getWaterGoal(db, user.id),
    getRecommendedWater(db, user.id, today),
    listSupplements(db, user.id, today),
  ]);
  const hasProfile = recommendedWater !== null;

  return (
    <>
      <PageHeader title={t("targets.title")} />
      <div className="grid gap-4">
        {hasProfile ? null : (
          <OnboardingPrompt title={t("noProfile.title")} text={t("noProfile.text")} action={t("noProfile.action")} />
        )}
        {target ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("targets.current")}</CardTitle>
              <CardDescription>
                {t(`targets.sources.${target.source}`)}
                {" · "}
                {t("targets.since", { date: formatDayLong(target.startDate) })}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <p className="text-3xl font-semibold tabular-nums">
                {t("macros.kcalValue", { value: formatNumber(target.kcal, 0) })}
              </p>
              <p className="text-sm tabular-nums">
                {t("macros.protein")} {target.proteinG} {t("units.g")}
                {" · "}
                {t("macros.carbs")} {target.carbsG} {t("units.g")}
                {" · "}
                {t("macros.fat")} {target.fatG} {t("units.g")}
              </p>
              {target.tdeeKcal ? (
                <p className="text-muted-foreground text-sm">
                  {t("targets.tdee", { value: formatNumber(target.tdeeKcal, 0) })}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {checkIn ? <CheckInCard checkIn={checkIn} unitSystem={user.unitSystem} /> : null}
        <Card>
          <CardHeader>
            <CardTitle>{t("targets.manualTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <TargetForm
              key={target ? `${target.startDate}-${target.kcal}-${target.proteinG}-${target.carbsG}-${target.fatG}` : "none"}
              target={target}
              canRecalculate={hasProfile}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("targets.waterTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <WaterGoalForm goalMl={waterGoal ?? recommendedWater ?? DEFAULT_WATER_GOAL_ML} recommendedMl={recommendedWater} />
          </CardContent>
        </Card>
        <Card id="supplements" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{t("supplements.title")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {supplements.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("supplements.empty")}</p>
            ) : (
              <ul className="divide-y">
                {supplements.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {[item.dose, t(`supplements.timings.${item.timing}`)].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <DeleteSupplementButton supplementId={item.id} name={item.name} />
                  </li>
                ))}
              </ul>
            )}
            <SupplementForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
