import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Meal } from "@/domain/nutrition/types";
import type { LocalDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import type { LogEntryView } from "../services/diary-service";
import { EntryRow } from "./entry-row";
import { MealMenu } from "./meal-menu";

export async function MealCard({ date, meal, entries }: { date: LocalDate; meal: Meal; entries: LogEntryView[] }) {
  const t = await getTranslations("nutrition");
  const label = t(`meals.${meal}`);
  const kcal = entries.reduce((total, entry) => total + entry.kcal, 0);
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <div>
          <CardTitle>{label}</CardTitle>
          {entries.length > 0 ? (
            <p className="text-muted-foreground text-sm">{t("diary.mealTotal", { value: formatNumber(kcal, 0) })}</p>
          ) : null}
        </div>
        <MealMenu date={date} meal={meal} mealLabel={label} hasEntries={entries.length > 0} />
      </CardHeader>
      <CardContent className="grid gap-2">
        {entries.length === 0 ? <p className="text-muted-foreground text-sm">{t("diary.empty")}</p> : null}
        {entries.map((entry) => (
          <EntryRow key={`${entry.id}-${entry.amount}`} entry={entry} />
        ))}
        <Button asChild variant="outline" className="mt-1">
          <Link href={`/nutrition/add?target=log&date=${date}&meal=${meal}`}>
            <PlusIcon aria-hidden />
            {t("diary.add")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
