"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { CheckIcon, PencilIcon, PlusIcon, SparklesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Activity } from "@/domain/cardio/types";
import { WEEKDAYS, type Weekday } from "@/domain/training/types";
import { useActionRunner } from "@/hooks/use-action-runner";
import { weekdayOf, type LocalDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { createCardioPlanFromProfileAction, deleteCardioPlanEntryAction } from "../actions";
import { dateOfWeekday } from "../form-values";
import type { CardioPlanEntry } from "../services/cardio-plan-service";

interface PlanCardProps {
  today: LocalDate;
  plan: CardioPlanEntry[];
  /** Geloggte Einheiten; daraus ergibt sich, was diese Woche schon erledigt ist. */
  activities: Activity[];
  onAdd: (weekday: Weekday) => void;
  onEdit: (entry: CardioPlanEntry) => void;
  onLog: (entry: CardioPlanEntry) => void;
}

/** Cardio-Wochenplan: geplante Einheiten je Wochentag, heute hervorgehoben. */
export function PlanCard({ today, plan, activities, onAdd, onEdit, onLog }: PlanCardProps) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const todayWeekday = weekdayOf(today);
  const logged = new Set(activities.map((activity) => `${activity.date}:${activity.type}`));

  function generate() {
    run(
      () => createCardioPlanFromProfileAction(),
      (count) => toast.success(t("cardio.plan.generated", { count })),
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardio.plan.title")}</CardTitle>
        <CardDescription>{t("cardio.plan.hint")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ul className="grid gap-2">
          {WEEKDAYS.map((weekday) => {
            const entries = plan.filter((entry) => entry.weekday === weekday);
            const day = t(`training.weekdays.${weekday}`);
            const isToday = weekday === todayWeekday;
            return (
              <li
                key={weekday}
                aria-current={isToday ? "date" : undefined}
                className={cn("grid gap-2 rounded-lg border py-1 pr-1 pl-3", isToday && "border-primary bg-primary/5")}
              >
                <div className="flex min-h-11 items-center gap-2">
                  <span className="text-sm font-medium">{day}</span>
                  {isToday ? <Badge>{t("cardio.plan.today")}</Badge> : null}
                  {entries.length === 0 ? (
                    <span className="text-muted-foreground min-w-0 flex-1 truncate text-right text-sm">
                      {t("cardio.plan.rest")}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-11"
                    aria-label={t("cardio.plan.addFor", { day })}
                    onClick={() => onAdd(weekday)}
                  >
                    <PlusIcon aria-hidden />
                  </Button>
                </div>
                {entries.map((entry) => {
                  const type = t(`cardio.types.${entry.type}`);
                  const done = logged.has(`${dateOfWeekday(today, weekday)}:${entry.type}`);
                  const summary = [type, t("cardio.values.minutes", { count: entry.minutes })];
                  if (entry.zone !== null) summary.push(t("cardio.values.zone", { zone: entry.zone }));
                  return (
                    <div key={entry.id} className="grid gap-1 border-t pt-2 pb-1">
                      <div className="flex flex-wrap items-center gap-2 pr-2">
                        <p className="text-sm font-medium">{summary.join(" · ")}</p>
                        {done ? (
                          <Badge variant="secondary">
                            <CheckIcon aria-hidden />
                            {t("cardio.plan.done")}
                          </Badge>
                        ) : null}
                      </div>
                      {entry.intervals ? (
                        <p className="text-muted-foreground pr-2 text-xs">
                          {t("cardio.values.intervals", {
                            repeats: entry.intervals.repeats,
                            work: entry.intervals.workSeconds,
                            rest: entry.intervals.restSeconds,
                          })}
                        </p>
                      ) : null}
                      {entry.note ? <p className="text-muted-foreground pr-2 text-xs break-words">{entry.note}</p> : null}
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={t("cardio.plan.logFor", { type, day })}
                          onClick={() => onLog(entry)}
                        >
                          {t("cardio.plan.log")}
                        </Button>
                        <span className="flex-1" />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={t("cardio.plan.edit", { type, day })}
                          onClick={() => onEdit(entry)}
                        >
                          <PencilIcon aria-hidden />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={t("cardio.plan.delete", { type, day })}
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => deleteCardioPlanEntryAction(entry.id),
                              () => toast.success(t("cardio.plan.deleted")),
                            )
                          }
                        >
                          <Trash2Icon aria-hidden />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </li>
            );
          })}
        </ul>
        <div className="grid gap-2">
          <Button variant="outline" onClick={() => onAdd(todayWeekday)}>
            <PlusIcon aria-hidden />
            {t("cardio.plan.add")}
          </Button>
          <Button
            variant="outline"
            className="h-auto min-h-11 whitespace-normal"
            disabled={pending}
            onClick={() => (plan.length === 0 ? generate() : setConfirmOpen(true))}
          >
            <SparklesIcon aria-hidden />
            {t("cardio.plan.generate")}
          </Button>
          <p className="text-muted-foreground text-xs">{t("cardio.plan.generateHint")}</p>
        </div>
      </CardContent>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cardio.plan.generateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cardio.plan.generateText")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={generate}>{t("cardio.plan.generateConfirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
