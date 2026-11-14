"use client";

import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { LocalDate } from "@/lib/dates";
import { formatClock, formatDayShort } from "@/lib/format";
import { deleteMobilityLogAction } from "../actions";

export interface RecentLogItem {
  id: string;
  /** Name der Routine; `null`, wenn es sie im Katalog nicht mehr gibt. */
  routineName: string | null;
  date: LocalDate;
  durationSeconds: number;
}

/** Die letzten Einträge mit der Möglichkeit, einen versehentlichen Eintrag zu löschen. */
export function RecentLogs({ logs }: { logs: RecentLogItem[] }) {
  const t = useTranslations("mobility.recent");
  const { run, pending } = useActionRunner();
  if (logs.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {logs.map((log) => {
            const name = log.routineName ?? t("unknownRoutine");
            return (
              <li key={log.id} className="flex min-h-11 items-center gap-3 py-2">
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{name}</span>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {formatDayShort(log.date)}
                    {" · "}
                    {formatClock(log.durationSeconds)}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11 shrink-0"
                  aria-label={t("delete", { name })}
                  disabled={pending}
                  onClick={() => run(() => deleteMobilityLogAction(log.id))}
                >
                  <Trash2Icon aria-hidden />
                </Button>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
