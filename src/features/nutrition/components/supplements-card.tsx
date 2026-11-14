"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { CheckIcon, PillIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { LocalDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { toggleSupplementAction } from "../actions";
import type { SupplementView } from "../services/tracking-service";

/** Supplements des Tages zum Abhaken. */
export function SupplementsCard({ date, supplements }: { date: LocalDate; supplements: SupplementView[] }) {
  const t = useTranslations("nutrition");
  const { run, pending } = useActionRunner();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <PillIcon className="text-muted-foreground size-5" aria-hidden />
          {t("supplements.title")}
        </CardTitle>
        <Link href="/nutrition/targets#supplements" className="text-primary text-sm underline underline-offset-4">
          {t("supplements.manage")}
        </Link>
      </CardHeader>
      <CardContent>
        {supplements.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("supplements.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {supplements.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={item.taken}
                  disabled={pending}
                  onClick={() => run(() => toggleSupplementAction(item.id, date, !item.taken))}
                  className={cn(
                    "flex min-h-12 w-full items-center gap-3 rounded-lg border px-3 text-left",
                    item.taken && "border-primary bg-primary/10",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md border",
                      item.taken ? "border-primary bg-primary text-primary-foreground" : "border-input",
                    )}
                  >
                    {item.taken ? <CheckIcon className="size-4" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.name}</span>
                    <span className="text-muted-foreground block text-xs">
                      {[item.dose, t(`supplements.timings.${item.timing}`)].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
