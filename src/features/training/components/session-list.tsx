import Link from "next/link";
import { routineTitle } from "../titles";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon } from "lucide-react";
import { formatDayShort, formatNumber } from "@/lib/format";
import { toDisplayWeight, weightUnitKey, type UnitSystem } from "@/lib/units";
import type { SessionSummary } from "../services/history-service";

/** Liste abgeschlossener Einheiten mit Link in die Detailansicht. */
export async function SessionList({ sessions, unitSystem }: { sessions: SessionSummary[]; unitSystem: UnitSystem }) {
  const t = await getTranslations("training");
  const unit = t(`units.${weightUnitKey(unitSystem)}`);
  return (
    <ul className="divide-y rounded-xl border">
      {sessions.map((session) => (
        <li key={session.id}>
          <Link href={`/workout/${session.id}`} className="hover:bg-accent/60 flex min-h-16 items-center gap-2 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block font-medium">
                {formatDayShort(session.date)}
                {" · "}
                {routineTitle(session, (focus) => t(`focus.${focus}`))}
              </span>
              <span className="text-muted-foreground block text-sm">
                {[
                  session.durationMinutes === null
                    ? null
                    : t("history.duration", { minutes: session.durationMinutes }),
                  t("history.sets", { count: session.completedSets }),
                  t("history.volume", {
                    volume: formatNumber(toDisplayWeight(session.volumeKg, unitSystem), 0),
                    unit,
                  }),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
