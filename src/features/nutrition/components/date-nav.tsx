import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { addDays, type LocalDate } from "@/lib/dates";
import { formatDayLong } from "@/lib/format";

/** Blättern zwischen den Tagen des Tagebuchs. */
export async function DateNav({ date, today }: { date: LocalDate; today: LocalDate }) {
  const t = await getTranslations("nutrition.diary");
  const href = (value: LocalDate) => (value === today ? "/nutrition" : `/nutrition?date=${value}`);
  const arrow = "flex size-11 items-center justify-center rounded-md border";
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <Link href={href(addDays(date, -1))} aria-label={t("previousDay")} className={arrow}>
        <ChevronLeftIcon className="size-5" aria-hidden />
      </Link>
      <div className="text-center">
        <h1 className="text-lg font-semibold">{date === today ? t("today") : formatDayLong(date)}</h1>
        {date === today ? (
          <p className="text-muted-foreground text-sm">{formatDayLong(date)}</p>
        ) : (
          <Link href="/nutrition" className="text-primary text-sm underline underline-offset-4">
            {t("goToToday")}
          </Link>
        )}
      </div>
      <Link href={href(addDays(date, 1))} aria-label={t("nextDay")} className={arrow}>
        <ChevronRightIcon className="size-5" aria-hidden />
      </Link>
    </div>
  );
}
