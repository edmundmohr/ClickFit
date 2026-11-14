"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Activity } from "@/domain/cardio/types";
import type { HeartRateZoneRange } from "@/domain/cardio/zones";
import type { LocalDate } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import { draftFromPlanEntry, emptyActivityDraft, type ActivityDraft } from "../form-values";
import type { WeekSummary } from "../services/activity-service";
import type { CardioPlanEntry } from "../services/cardio-plan-service";
import { ActivityForm } from "./activity-form";
import { ActivityList } from "./activity-list";
import { PlanCard } from "./plan-card";
import { PlanEntryForm, type PlanDraft } from "./plan-entry-form";

interface CardioBoardProps {
  today: LocalDate;
  week: WeekSummary;
  plan: CardioPlanEntry[];
  activities: Activity[];
  recentDays: number;
  zones: HeartRateZoneRange[] | null;
  maxBpm: number | null;
}

/** Wochen-Summe, Wochenplan und letzte Einheiten; hält den Zustand der beiden Formulare. */
export function CardioBoard({ today, week, plan, activities, recentDays, zones, maxBpm }: CardioBoardProps) {
  const t = useTranslations("cardio");
  const [activityDraft, setActivityDraft] = useState<ActivityDraft | null>(null);
  const [planDraft, setPlanDraft] = useState<PlanDraft | null>(null);

  const stats = [
    { label: t("week.sessions"), value: formatNumber(week.sessions, 0) },
    { label: t("week.minutes"), value: formatNumber(week.durationSeconds / 60, 0) },
    { label: t("week.distance"), value: formatNumber(week.distanceMeters / 1000, 1) },
  ];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("week.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-3 gap-2 text-center">
            {stats.map((stat) => (
              <div key={stat.label} className="bg-secondary rounded-lg px-1 py-3">
                <dd className="text-xl font-semibold tabular-nums">{stat.value}</dd>
                <dt className="text-muted-foreground text-xs">{stat.label}</dt>
              </div>
            ))}
          </dl>
          <Button size="lg" className="w-full" onClick={() => setActivityDraft(emptyActivityDraft(today))}>
            <PlusIcon aria-hidden />
            {t("week.log")}
          </Button>
        </CardContent>
      </Card>
      <PlanCard
        today={today}
        plan={plan}
        activities={activities}
        onAdd={(weekday) => setPlanDraft({ weekday })}
        onEdit={(entry) => setPlanDraft({ entry })}
        onLog={(entry) => setActivityDraft(draftFromPlanEntry(entry, today))}
      />
      <ActivityList activities={activities} days={recentDays} />
      {activityDraft ? (
        <ActivityForm
          draft={activityDraft}
          today={today}
          zones={zones}
          maxBpm={maxBpm}
          onClose={() => setActivityDraft(null)}
        />
      ) : null}
      {planDraft ? <PlanEntryForm draft={planDraft} zones={zones} onClose={() => setPlanDraft(null)} /> : null}
    </>
  );
}
