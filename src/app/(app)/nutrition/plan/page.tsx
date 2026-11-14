import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { ApplyPlanButton, RemovePlanEntryButton } from "@/features/nutrition/components/plan-actions";
import { getPlanDay, getPlanWeekTotals } from "@/features/nutrition/services/meal-plan-service";
import { getCurrentTarget } from "@/features/nutrition/services/target-service";
import { MEALS } from "@/domain/nutrition/types";
import { WEEKDAYS, type Weekday } from "@/domain/training/types";
import { toLocalDate, weekdayOf } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nutrition.plan");
  return { title: t("title") };
}

export default async function MealPlanPage({ searchParams }: PageProps<"/nutrition/plan">) {
  const user = await requireUser();
  const t = await getTranslations();
  const today = toLocalDate(new Date());
  const params = await searchParams;
  const requested = Number(typeof params.day === "string" ? params.day : NaN);
  const weekday: Weekday = WEEKDAYS.find((day) => day === requested) ?? weekdayOf(today);
  const db = getDb();
  const [plan, totals, target] = await Promise.all([
    getPlanDay(db, user.id, weekday),
    getPlanWeekTotals(db, user.id),
    getCurrentTarget(db, user.id, today),
  ]);

  const planned = Math.round(plan.total.kcal);
  const diff = target ? planned - target.kcal : null;
  const diffText =
    diff === null
      ? null
      : diff === 0
        ? t("nutrition.plan.diffExact")
        : diff < 0
          ? t("nutrition.plan.diffUnder", { value: formatNumber(-diff, 0) })
          : t("nutrition.plan.diffOver", { value: formatNumber(diff, 0) });

  return (
    <>
      <PageHeader title={t("nutrition.plan.title")} description={t("nutrition.plan.hint")} />
      <div className="mb-4 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((day) => (
          <Link
            key={day}
            href={`/nutrition/plan?day=${day}`}
            aria-current={day === weekday ? "page" : undefined}
            aria-label={t("nutrition.plan.dayLabel", {
              weekday: t(`training.weekdays.${day}`),
              value: formatNumber(totals.get(day) ?? 0, 0),
            })}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center rounded-lg border text-sm font-medium",
              day === weekday ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent/60",
            )}
          >
            <span>{t(`training.weekdaysShort.${day}`)}</span>
            <span className="text-[10px] font-normal tabular-nums opacity-80">
              {totals.has(day) ? formatNumber(totals.get(day) ?? 0, 0) : "–"}
            </span>
          </Link>
        ))}
      </div>

      <div className="grid gap-4">
        <Card>
          <CardContent className="grid gap-1 text-sm">
            <p className="text-base font-medium">{t("nutrition.plan.dayTotal", { value: formatNumber(planned, 0) })}</p>
            {target && diffText ? (
              <p className="text-muted-foreground">
                {t("nutrition.plan.vsTarget", { target: formatNumber(target.kcal, 0), diff: diffText })}
              </p>
            ) : null}
            <p className="text-muted-foreground tabular-nums">
              {t("nutrition.macros.line", {
                kcal: formatNumber(plan.total.kcal, 0),
                protein: formatNumber(plan.total.proteinG, 0),
                carbs: formatNumber(plan.total.carbsG, 0),
                fat: formatNumber(plan.total.fatG, 0),
              })}
            </p>
          </CardContent>
        </Card>
        {MEALS.map((meal) => (
          <Card key={meal}>
            <CardHeader>
              <CardTitle>{t(`nutrition.meals.${meal}`)}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {plan.meals[meal].length === 0 ? (
                <p className="text-muted-foreground text-sm">{t("nutrition.plan.empty")}</p>
              ) : (
                <ul className="divide-y">
                  {plan.meals[meal].map((entry) => (
                    <li key={entry.id} className="flex items-center gap-2 py-2">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{entry.name}</span>
                        <span className="text-muted-foreground block text-xs">
                          {formatNumber(entry.amount)} {t(`nutrition.units.${entry.amountUnit}`)}
                          {" · "}
                          {t("nutrition.macros.kcalValue", { value: formatNumber(entry.kcal, 0) })}
                        </span>
                      </span>
                      <RemovePlanEntryButton entryId={entry.id} name={entry.name} />
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="outline">
                <Link href={`/nutrition/add?target=plan&weekday=${weekday}&meal=${meal}`}>
                  <PlusIcon aria-hidden />
                  {t("nutrition.plan.add")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        <div>
          <ApplyPlanButton weekday={weekday} today={today} />
        </div>
      </div>
    </>
  );
}
