"use client";

import { useTranslations } from "next-intl";
import { TimerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/format";
import type { RestTimer } from "./hooks";

const ADJUST_STEP_SECONDS = 15;

/** Leiste am unteren Rand mit dem laufenden Pausentimer. */
export function RestTimerBar({ timer }: { timer: RestTimer }) {
  const t = useTranslations("workout.timer");
  if (timer.remaining === null && !timer.justFinished) return null;

  const progress = timer.remaining !== null && timer.total > 0 ? timer.remaining / timer.total : 0;
  return (
    <div
      role="timer"
      aria-live="polite"
      className="bg-background fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] shadow-lg"
    >
      <div className="bg-secondary h-1">
        <div className="bg-primary h-full transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
      </div>
      {timer.remaining === null ? (
        <p className="px-4 py-4 text-center font-medium">{t("over")}</p>
      ) : (
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-2">
          <TimerIcon className="text-muted-foreground size-5" aria-hidden />
          <span className="sr-only">{t("title")}</span>
          <span className="flex-1 text-3xl font-semibold tabular-nums">{formatClock(timer.remaining)}</span>
          <Button variant="outline" size="sm" onClick={() => timer.adjust(-ADJUST_STEP_SECONDS)}>
            {t("subtract")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => timer.adjust(ADJUST_STEP_SECONDS)}>
            {t("add")}
          </Button>
          <Button size="sm" onClick={timer.stop}>
            {t("skip")}
          </Button>
        </div>
      )}
    </div>
  );
}
