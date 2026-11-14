"use client";

import { useReducer, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { warmupSets } from "@/domain/training/progression";
import { estimateRemainingSeconds, isWorkoutForgotten, suggestFinishTime } from "@/domain/training/schedule";
import { formatDayLong, formatDuration, formatTime } from "@/lib/format";
import { toDisplayWeight, type UnitSystem } from "@/lib/units";
import { deleteSetAction, deleteWorkoutAction, finishWorkoutAction } from "../../actions";
import type { WorkoutView } from "../../services/workout-view";
import { ConfirmDialog, ExerciseNoteDialog, SetOptionsDialog } from "./dialogs";
import { ExerciseCard, type InvalidField } from "./exercise-card";
import { useAlertSignal, useNow, useRestTimer, useWakeLock } from "./hooks";
import { RestTimerBar } from "./rest-timer-bar";
import { SessionNote } from "./session-note";
import { useSetSync } from "./use-set-sync";
import { WorkoutSummary } from "./workout-summary";
import {
  newSetFrom,
  parseReps,
  parseWeightKg,
  toDrafts,
  toInputText,
  workSetNumber,
  workoutReducer,
  type SetDraft,
} from "./workout-state";

/** Nach Aufwärmsätzen genügt eine kurze Pause. */
const WARMUP_REST_SECONDS = 45;

interface WorkoutScreenProps {
  view: WorkoutView;
  unitSystem: UnitSystem;
}

interface SetRef {
  exerciseId: string;
  setId: string;
}

export function WorkoutScreen({ view, unitSystem }: WorkoutScreenProps) {
  const t = useTranslations();
  const router = useRouter();
  const inProgress = view.status === "in_progress";
  const [exercises, dispatch] = useReducer(workoutReducer, view.exercises, (initial) =>
    toDrafts(initial, unitSystem),
  );
  const sync = useSetSync(exercises, unitSystem);
  const alertSignal = useAlertSignal();
  const timer = useRestTimer(alertSignal.signal);
  const now = useNow(inProgress);
  useWakeLock(inProgress);

  const [invalid, setInvalid] = useState<InvalidField | null>(null);
  const [optionsFor, setOptionsFor] = useState<SetRef | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"finish" | "delete" | null>(null);
  const [forgottenDismissed, setForgottenDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  const startedAt = new Date(view.startedAt);
  const allSets = exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({ completed: set.completed, restSeconds: exercise.restSeconds })),
  );
  const openSets = allSets.filter((set) => !set.completed).length;
  const elapsedSeconds = now === null ? null : (now - startedAt.getTime()) / 1000;
  const durationMinutes = view.finishedAt
    ? Math.max(1, Math.round((new Date(view.finishedAt).getTime() - startedAt.getTime()) / 60000))
    : null;

  const findSet = (ref: SetRef) => {
    const exercise = exercises.find((item) => item.id === ref.exerciseId);
    const set = exercise?.sets.find((item) => item.id === ref.setId);
    return exercise && set ? { exercise, set } : null;
  };

  function edit(exerciseId: string, setId: string, patch: Partial<SetDraft>) {
    dispatch({ type: "edit", exerciseId, setId, patch });
    sync.schedule(setId);
    setInvalid(null);
  }

  function toggle(exerciseId: string, setId: string) {
    const found = findSet({ exerciseId, setId });
    if (!found) return;
    const { exercise, set } = found;
    if (!set.completed) {
      const reps = parseReps(set);
      if (reps === null || reps <= 0) {
        setInvalid({ setId, field: "reps" });
        toast.error(t("workout.needsReps"));
        return;
      }
      if (exercise.type === "weight_reps" && parseWeightKg(set, unitSystem) === null) {
        setInvalid({ setId, field: "weight" });
        toast.error(t("workout.needsWeight"));
        return;
      }
    }
    dispatch({ type: "edit", exerciseId, setId, patch: { completed: !set.completed } });
    sync.schedule(setId, true);
    setInvalid(null);
    if (set.completed) return;
    // Noch leere Folgesätze übernehmen die Werte: So genügt danach ein Tipp pro Satz.
    for (const later of exercise.sets.slice(exercise.sets.indexOf(set) + 1)) {
      if (later.completed || later.weightText !== "" || later.repsText !== "") continue;
      dispatch({
        type: "edit",
        exerciseId,
        setId: later.id,
        patch: { weightText: set.weightText, repsText: set.repsText },
      });
    }
    if (!inProgress) return;
    // Der Tipp ist die Nutzeraktion, die iOS für den späteren Signalton verlangt.
    alertSignal.prime();
    if (openSets > 1) {
      timer.start(set.type === "warmup" ? Math.min(exercise.restSeconds, WARMUP_REST_SECONDS) : exercise.restSeconds);
    } else {
      timer.stop();
    }
  }

  function addSet(exerciseId: string) {
    const exercise = exercises.find((item) => item.id === exerciseId);
    if (!exercise) return;
    const set = newSetFrom(exercise.sets.at(-1), crypto.randomUUID());
    dispatch({ type: "add", exerciseId, set });
    sync.schedule(set.id, true);
  }

  function addWarmup(exerciseId: string) {
    const exercise = exercises.find((item) => item.id === exerciseId);
    if (!exercise) return;
    const firstWork = exercise.sets.find((set) => set.type !== "warmup");
    const workWeightKg = firstWork ? parseWeightKg(firstWork, unitSystem) : null;
    if (workWeightKg === null || workWeightKg <= 0) {
      toast.error(t("workout.warmupNeedsWeight"));
      return;
    }
    const hasWarmup = exercise.sets.some((set) => set.type === "warmup");
    const suggested = hasWarmup ? [] : warmupSets(workWeightKg, exercise.incrementKg);
    if (suggested.length === 0) {
      toast.info(t("workout.warmupNotNeeded"));
      return;
    }
    const drafts: SetDraft[] = suggested.map((warmup) => ({
      id: crypto.randomUUID(),
      type: "warmup",
      weightText: toInputText(toDisplayWeight(warmup.weightKg, unitSystem)),
      repsText: String(warmup.reps),
      rir: null,
      note: "",
      completed: false,
    }));
    dispatch({ type: "prepend", exerciseId, sets: drafts });
    // Die Positionen aller Sätze der Übung verschieben sich: alle neu speichern.
    for (const set of [...drafts, ...exercise.sets]) sync.schedule(set.id, true);
    toast.success(t("workout.warmupAdded"));
  }

  function removeSet(ref: SetRef) {
    const found = findSet(ref);
    setOptionsFor(null);
    if (!found) return;
    dispatch({ type: "remove", exerciseId: ref.exerciseId, setId: ref.setId });
    sync.forget(ref.setId);
    for (const set of found.exercise.sets) if (set.id !== ref.setId) sync.schedule(set.id, true);
    void deleteSetAction(ref.setId);
  }

  function finish(finishedAt?: Date) {
    setConfirm(null);
    timer.stop();
    startTransition(async () => {
      await sync.flushAll();
      const result = await finishWorkoutAction(view.id, finishedAt?.toISOString());
      if (result.ok) router.refresh();
      else toast.error(t(`errors.${result.error}`));
    });
  }

  function remove() {
    setConfirm(null);
    startTransition(async () => {
      const result = await deleteWorkoutAction(view.id);
      if (!result.ok) {
        toast.error(t(`errors.${result.error}`));
        return;
      }
      toast.success(t("workout.deleted"));
      router.replace("/training");
    });
  }

  const lastCompleted = view.exercises
    .flatMap((exercise) => exercise.sets.map((set) => set.completedAt))
    .filter((value): value is string => value !== null)
    .sort()
    .at(-1);
  const suggestedEnd = suggestFinishTime(startedAt, lastCompleted ? new Date(lastCompleted) : null);
  const showForgotten =
    inProgress && !forgottenDismissed && now !== null && isWorkoutForgotten(startedAt, new Date(now));

  const optionsTarget = optionsFor ? findSet(optionsFor) : null;
  const noteExercise = exercises.find((exercise) => exercise.exerciseId === noteFor) ?? null;
  const title = view.focus ? t(`training.focus.${view.focus}`) : t("training.focus.free");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="bg-background/95 sticky top-0 z-30 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-2 py-2">
          <Link
            href="/training"
            aria-label={t("workout.back")}
            className="flex size-11 shrink-0 items-center justify-center"
          >
            <ArrowLeftIcon className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-semibold">{title}</h1>
            <p
              className="text-muted-foreground truncate text-sm tabular-nums"
              aria-label={inProgress ? t("workout.statusLabel") : undefined}
            >
              {inProgress
                ? t("workout.status", {
                    elapsed: elapsedSeconds === null ? "–" : formatDuration(elapsedSeconds),
                    minutes: Math.ceil(estimateRemainingSeconds(allSets) / 60),
                  })
                : formatDayLong(view.date)}
            </p>
          </div>
          {view.isDeload ? <Badge variant="secondary">{t("workout.deload")}</Badge> : null}
          {inProgress ? (
            <Button onClick={() => setConfirm("finish")} disabled={pending}>
              {t("workout.finish")}
            </Button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-3xl flex-1 content-start gap-4 px-4 pt-4 pb-40">
        {showForgotten ? (
          <Alert>
            <AlertTitle>{t("workout.forgotten.title")}</AlertTitle>
            <AlertDescription className="grid gap-3">
              {t("workout.forgotten.text", { time: formatTime(suggestedEnd) })}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => finish(suggestedEnd)} disabled={pending}>
                  {t("workout.forgotten.finish", { time: formatTime(suggestedEnd) })}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setForgottenDismissed(true)}>
                  {t("workout.forgotten.keep")}
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : null}
        {sync.failed ? (
          <Alert variant="destructive" role="alert">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              {t("workout.sync.error")}
              <Button size="sm" variant="outline" onClick={() => void sync.flushAll()}>
                {t("workout.sync.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {inProgress ? null : (
          <WorkoutSummary exercises={exercises} durationMinutes={durationMinutes} unitSystem={unitSystem} />
        )}

        {exercises.map((exercise) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            unitSystem={unitSystem}
            invalid={invalid}
            onEdit={(setId, patch) => edit(exercise.id, setId, patch)}
            onToggle={(setId) => toggle(exercise.id, setId)}
            onOpenOptions={(setId) => setOptionsFor({ exerciseId: exercise.id, setId })}
            onAddSet={() => addSet(exercise.id)}
            onAddWarmup={() => addWarmup(exercise.id)}
            onEditNote={() => setNoteFor(exercise.exerciseId)}
          />
        ))}

        <SessionNote sessionId={view.id} initialNote={view.note} />
        <div className="flex flex-wrap gap-3">
          {inProgress ? null : (
            <Button asChild variant="outline">
              <Link href="/training">{t("workout.summary.toPlan")}</Link>
            </Button>
          )}
          <Button variant="ghost" className="text-destructive" onClick={() => setConfirm("delete")} disabled={pending}>
            <Trash2Icon aria-hidden />
            {t(inProgress ? "workout.discard" : "workout.delete")}
          </Button>
        </div>
      </main>

      {inProgress ? <RestTimerBar timer={timer} /> : null}

      <SetOptionsDialog
        set={optionsTarget?.set ?? null}
        number={optionsTarget ? workSetNumber(optionsTarget.exercise.sets, optionsTarget.set.id) : 1}
        onEdit={(patch) => optionsFor && edit(optionsFor.exerciseId, optionsFor.setId, patch)}
        onDelete={() => optionsFor && removeSet(optionsFor)}
        onClose={() => setOptionsFor(null)}
      />
      <ExerciseNoteDialog
        exercise={noteExercise}
        onSaved={(note) => noteFor && dispatch({ type: "note", catalogExerciseId: noteFor, note })}
        onClose={() => setNoteFor(null)}
      />
      <ConfirmDialog
        open={confirm === "finish"}
        title={t("workout.finishDialog.title")}
        text={
          openSets === 0 ? t("workout.finishDialog.allDone") : t("workout.finishDialog.open", { count: openSets })
        }
        confirmLabel={t("workout.finishDialog.confirm")}
        cancelLabel={t("workout.finishDialog.cancel")}
        onConfirm={() => finish()}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title={t("workout.deleteTitle")}
        text={t("workout.deleteText")}
        confirmLabel={t("workout.deleteConfirm")}
        cancelLabel={t("common.cancel")}
        destructive
        onConfirm={remove}
        onClose={() => setConfirm(null)}
      />
    </div>
  );
}
