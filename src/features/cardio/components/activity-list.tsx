"use client";

import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { paceSecondsPerKm, speedKmh, usesPace } from "@/domain/cardio/load";
import type { Activity } from "@/domain/cardio/types";
import { useActionRunner } from "@/hooks/use-action-runner";
import { formatClock, formatDayShort, formatNumber } from "@/lib/format";
import { deleteActivityAction } from "../actions";

/** Liste der zuletzt eingetragenen Einheiten mit Kennzahlen und Löschen. */
export function ActivityList({ activities, days }: { activities: Activity[]; days: number }) {
  const t = useTranslations("cardio");
  const { run, pending } = useActionRunner();

  function metrics(activity: Activity): string[] {
    const parts = [t("values.minutes", { count: formatNumber(activity.durationSeconds / 60, 0) })];
    if (activity.distanceMeters !== null) {
      parts.push(t("values.distance", { value: formatNumber(activity.distanceMeters / 1000, 2) }));
      const pace = paceSecondsPerKm(activity.distanceMeters, activity.durationSeconds);
      const speed = speedKmh(activity.distanceMeters, activity.durationSeconds);
      if (usesPace(activity.type) && pace !== null) parts.push(t("values.pace", { value: formatClock(pace) }));
      else if (speed !== null) parts.push(t("values.speed", { value: formatNumber(speed) }));
    }
    return parts;
  }

  function details(activity: Activity): string[] {
    const parts = [t(`intensities.${activity.intensity}`)];
    if (activity.avgHeartRate !== null) parts.push(t("values.heartRate", { value: activity.avgHeartRate }));
    if (activity.zone !== null) parts.push(t("values.zone", { zone: activity.zone }));
    if (activity.intervals) {
      parts.push(
        t("values.intervals", {
          repeats: activity.intervals.repeats,
          work: activity.intervals.workSeconds,
          rest: activity.intervals.restSeconds,
        }),
      );
    }
    return parts;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("recent.title")}</CardTitle>
        <CardDescription>{t("recent.hint", { days })}</CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("recent.empty")}</p>
        ) : (
          <ul className="grid gap-2">
            {activities.map((activity) => {
              const type = t(`types.${activity.type}`);
              const date = formatDayShort(activity.date);
              return (
                <li key={activity.id} className="flex items-start gap-2 rounded-lg border py-2 pr-1 pl-3">
                  <div className="grid min-w-0 flex-1 gap-0.5 py-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                      <span>{type}</span>
                      <span className="text-muted-foreground text-xs font-normal">{date}</span>
                    </p>
                    <p className="text-sm tabular-nums">{metrics(activity).join(" · ")}</p>
                    <p className="text-muted-foreground text-xs">{details(activity).join(" · ")}</p>
                    {activity.note ? <p className="text-muted-foreground text-xs break-words">{activity.note}</p> : null}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={t("recent.delete", { type, date })}
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => deleteActivityAction(activity.id),
                        () => toast.success(t("recent.deleted")),
                      )
                    }
                  >
                    <Trash2Icon aria-hidden />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
