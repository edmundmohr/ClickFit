"use client";

import { useTranslations } from "next-intl";
import { DropletIcon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { LocalDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { addWaterAction, undoWaterAction } from "../actions";

const QUICK_AMOUNTS_ML = [250, 330, 500];

/** Wassertracker mit Schnell-Buttons. `date` = `null` bucht auf „heute“ zum Zeitpunkt des Klicks. */
export function WaterCard({ date, totalMl, goalMl }: { date: LocalDate | null; totalMl: number; goalMl: number }) {
  const t = useTranslations("nutrition");
  const { run, pending } = useActionRunner();
  const share = Math.min(totalMl / goalMl, 1);
  const liters = (ml: number) => formatNumber(ml / 1000, 2);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="flex items-center gap-2">
          <DropletIcon className="size-5 text-sky-500" aria-hidden />
          {t("water.title")}
        </CardTitle>
        <p className="text-sm tabular-nums">
          {totalMl >= goalMl ? `${t("water.goalReached")} · ` : ""}
          {t("water.progress", { value: liters(totalMl), goal: liters(goalMl) })}
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="bg-secondary h-2 overflow-hidden rounded-full">
          <div className="h-full rounded-full bg-sky-500" style={{ width: `${share * 100}%` }} />
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_AMOUNTS_ML.map((amount) => (
            <Button
              key={amount}
              variant="outline"
              disabled={pending}
              onClick={() => run(() => addWaterAction(date, amount))}
            >
              {t("water.add", { amount })}
            </Button>
          ))}
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("water.undo")}
            disabled={pending || totalMl === 0}
            onClick={() => run(() => undoWaterAction(date))}
          >
            <Undo2Icon aria-hidden />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
