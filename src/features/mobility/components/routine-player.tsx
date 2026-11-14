"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  CheckCircle2Icon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  INITIAL_PLAYER_STATE,
  playerElapsedSeconds,
  playerRemainingSeconds,
  reducePlayer,
  type PlayerEvent,
  type PlayerState,
} from "@/domain/mobility/player";
import type { MobilitySide } from "@/domain/mobility/types";
import { useAlertSignal, useWakeLock } from "@/features/training/components/workout/hooks";
import { useActionRunner } from "@/hooks/use-action-runner";
import { formatClock } from "@/lib/format";
import { completeMobilityRoutineAction } from "../actions";

/** Ein Schritt des geführten Ablaufs, fertig aufbereitet für die Anzeige. */
export interface PlayerStep {
  key: string;
  name: string;
  side: MobilitySide | null;
  /** Haltezeit; `null` bei Wiederholungen. */
  durationSeconds: number | null;
  /** Wiederholungen; `null` bei gehaltenen Übungen. */
  reps: number | null;
  instructions: string[];
  hint: string | null;
}

const TICK_MS = 250;
const CONTROL_CLASS = "h-14 text-base md:h-14";

/** Geführter Ablauf: Countdown je Schritt, automatischer Wechsel, am Ende der Eintrag ins Protokoll. */
export function RoutinePlayer({ routineId, steps }: { routineId: string; steps: PlayerStep[] }) {
  const t = useTranslations("mobility.player");
  const reducer = useMemo(() => (state: PlayerState, event: PlayerEvent) => reducePlayer(state, event, steps), [steps]);
  const [state, dispatch] = useReducer(reducer, INITIAL_PLAYER_STATE);
  const [logged, setLogged] = useState(false);
  const { prime, signal } = useAlertSignal();
  const { run, pending } = useActionRunner();
  const running = state.status === "running";

  useWakeLock(running);

  // Der Countdown rechnet mit dem Endzeitpunkt; der Takt sorgt nur für die Anzeige.
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => dispatch({ type: "tick", now: Date.now() }), TICK_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  // Jeder abgelaufene Übungs-Countdown erhöht den Zähler: einmal Ton und Vibration.
  useEffect(() => {
    if (state.signals > 0) signal();
  }, [state.signals, signal]);

  const start = () => {
    // iOS erlaubt Töne erst nach einem Tipp.
    prime();
    dispatch({ type: "start", now: Date.now() });
  };

  if (state.status === "idle") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("intro")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button size="lg" className={`w-full ${CONTROL_CLASS}`} onClick={start}>
            <PlayIcon aria-hidden />
            {t("start")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.status === "finished") {
    const elapsedSeconds = playerElapsedSeconds(state);
    const restart = () => {
      setLogged(false);
      dispatch({ type: "reset" });
    };
    return (
      <Card>
        <CardHeader className="justify-items-center text-center">
          <CheckCircle2Icon className="text-primary size-12" aria-hidden />
          <CardTitle className="text-xl" role="status">
            {logged ? t("loggedTitle") : t("finishedTitle")}
          </CardTitle>
          <CardDescription>
            {logged ? t("loggedText") : t("finishedText", { time: formatClock(elapsedSeconds) })}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {logged ? (
            <Button asChild size="lg" className={CONTROL_CLASS}>
              <Link href="/training/mobility">{t("backToOverview")}</Link>
            </Button>
          ) : (
            <Button
              size="lg"
              className={CONTROL_CLASS}
              disabled={pending}
              onClick={() => run(() => completeMobilityRoutineAction(routineId, elapsedSeconds), () => setLogged(true))}
            >
              <CheckIcon aria-hidden />
              {t("complete")}
            </Button>
          )}
          <Button variant="ghost" disabled={pending} onClick={restart}>
            <RotateCcwIcon aria-hidden />
            {t("restart")}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const step = steps[state.index];
  const upcoming = steps[state.index + 1];
  const remaining = playerRemainingSeconds(state);
  const working = state.phase === "work";
  const phaseLabel = state.status === "paused" ? t("paused") : working ? t("go") : t("prepare");
  const dose = step.durationSeconds !== null ? t("hold", { count: step.durationSeconds }) : t("repeat", { count: step.reps ?? 0 });

  return (
    <Card>
      <CardContent className="grid gap-5">
        <div className="grid gap-2">
          <p className="text-muted-foreground text-sm tabular-nums">
            {t("step", { current: state.index + 1, total: steps.length })}
          </p>
          <div className="bg-secondary h-2 overflow-hidden rounded-full">
            <div
              className="bg-primary h-full rounded-full transition-[width] duration-300"
              style={{ width: `${(state.index / steps.length) * 100}%` }}
            />
          </div>
        </div>

        <div className="grid justify-items-center gap-2 text-center">
          <h2 className="max-w-full text-xl font-semibold text-balance break-words hyphens-auto">{step.name}</h2>
          {step.side ? <Badge>{t(`sides.${step.side}`)}</Badge> : null}
          <p className={working ? "text-primary text-sm font-medium" : "text-muted-foreground text-sm font-medium"}>
            {phaseLabel}
          </p>
          {remaining !== null ? (
            <p role="timer" aria-live="off" className="text-7xl leading-none font-semibold tabular-nums">
              {formatClock(remaining)}
            </p>
          ) : (
            <p className="text-7xl leading-none font-semibold tabular-nums">{step.reps}</p>
          )}
          {remaining === null ? (
            <p className="text-muted-foreground text-sm">{t("repsUnit", { count: step.reps ?? 0 })}</p>
          ) : working ? null : (
            <p className="text-muted-foreground text-sm">{dose}</p>
          )}
        </div>

        {working && step.durationSeconds === null ? (
          <Button size="lg" className={CONTROL_CLASS} onClick={() => dispatch({ type: "next", now: Date.now() })}>
            <CheckIcon aria-hidden />
            {t("done")}
          </Button>
        ) : null}

        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            className={CONTROL_CLASS}
            aria-label={t("previous")}
            onClick={() => dispatch({ type: "previous", now: Date.now() })}
          >
            <ChevronLeftIcon className="size-6" aria-hidden />
          </Button>
          {running ? (
            <Button
              variant="secondary"
              className={CONTROL_CLASS}
              aria-label={t("pause")}
              onClick={() => dispatch({ type: "pause", now: Date.now() })}
            >
              <PauseIcon className="size-6" aria-hidden />
            </Button>
          ) : (
            <Button className={CONTROL_CLASS} aria-label={t("resume")} onClick={start}>
              <PlayIcon className="size-6" aria-hidden />
            </Button>
          )}
          <Button
            variant="outline"
            className={CONTROL_CLASS}
            aria-label={t("next")}
            onClick={() => dispatch({ type: "next", now: Date.now() })}
          >
            <ChevronRightIcon className="size-6" aria-hidden />
          </Button>
        </div>

        <div className="grid gap-2">
          <ol className="list-decimal space-y-1.5 pl-5">
            {step.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
          {step.hint ? <p className="text-muted-foreground text-sm">{step.hint}</p> : null}
        </div>

        <p className="text-muted-foreground border-t pt-4 text-sm">
          {upcoming
            ? t("upNext", { name: upcoming.side ? `${upcoming.name} (${t(`sides.${upcoming.side}`)})` : upcoming.name })
            : t("lastStep")}
        </p>
        <Button variant="ghost" onClick={() => dispatch({ type: "reset" })}>
          {t("cancel")}
        </Button>
      </CardContent>
    </Card>
  );
}
