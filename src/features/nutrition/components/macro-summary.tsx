import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import type { Macros } from "@/domain/nutrition/types";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function Bar({ value, target, className }: { value: number; target: number | null; className?: string }) {
  const share = target && target > 0 ? Math.min(value / target, 1) : 0;
  return (
    <div className="bg-secondary h-2 overflow-hidden rounded-full">
      <div className={cn("bg-primary h-full rounded-full", className)} style={{ width: `${share * 100}%` }} />
    </div>
  );
}

/** Tagesübersicht: gegessene Kalorien und Makros im Vergleich zum Ziel. */
export async function MacroSummary({ total, target }: { total: Macros; target: Macros | null }) {
  const t = await getTranslations("nutrition");
  const eaten = Math.round(total.kcal);
  const diff = target ? target.kcal - eaten : null;
  const macros = [
    { key: "protein", value: total.proteinG, target: target?.proteinG ?? null },
    { key: "carbs", value: total.carbsG, target: target?.carbsG ?? null },
    { key: "fat", value: total.fatG, target: target?.fatG ?? null },
  ] as const;

  return (
    <Card>
      <CardContent className="grid gap-4">
        <div>
          <div className="flex items-baseline justify-between gap-2">
            <p>
              <span className="text-3xl font-semibold tabular-nums">{formatNumber(eaten, 0)}</span>{" "}
              <span className="text-muted-foreground text-sm">
                {t("units.kcal")} {t("diary.eaten")}
              </span>
            </p>
            <p className="text-muted-foreground text-sm">
              {target ? t("diary.target", { value: formatNumber(target.kcal, 0) }) : t("diary.noTarget")}
            </p>
          </div>
          <Bar value={eaten} target={target?.kcal ?? null} className={diff !== null && diff < 0 ? "bg-destructive" : undefined} />
          {diff !== null ? (
            <p className={cn("mt-1 text-sm", diff < 0 ? "text-destructive" : "text-muted-foreground")}>
              {diff >= 0
                ? t("diary.remaining", { value: formatNumber(diff, 0) })
                : t("diary.over", { value: formatNumber(-diff, 0) })}
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-3 gap-3">
          {macros.map((macro) => (
            <div key={macro.key} className="grid gap-1">
              <dt className="text-muted-foreground text-xs">{t(`macros.${macro.key}`)}</dt>
              <dd className="text-sm font-medium tabular-nums">
                {macro.target === null
                  ? t("macros.grams", { value: formatNumber(macro.value, 0) })
                  : t("diary.of", { value: formatNumber(macro.value, 0), target: macro.target })}
              </dd>
              <Bar value={macro.value} target={macro.target} />
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
