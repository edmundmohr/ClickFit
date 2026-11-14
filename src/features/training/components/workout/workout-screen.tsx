"use client";

import { useEffect, useReducer, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeftIcon, CameraIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { warmupSets } from "@/domain/training/progression";
import { isAssisted } from "@/domain/training/records";
import type { ExerciseFeedback } from "@/domain/training/types";
import { afterSetCompleted, groupConsecutive, groupKind, groupRestSeconds } from "@/domain/training/supersets";
import { estimateRemainingSeconds, isWorkoutForgotten, suggestFinishTime } from "@/domain/training/schedule";
import { formatDayLong, formatDuration, formatTime } from "@/lib/format";
import { toDisplayWeight, unitSystemOf, type UnitSystem } from "@/lib/units";
import { useRestPush } from "@/features/notifications/use-rest-push";
import { getSyncEngine, tellServiceWorker } from "@/lib/offline/client";
import { deleteWorkoutAction } from "../../actions";
import type { WorkoutView } from "../../services/workout-view";
import { ConfirmDialog, ExerciseInfoDialog, ExerciseNoteDialog, SetOptionsDialog } from "./dialogs";
import { ExerciseCard, type InvalidField } from "./exercise-card";
import { useAlertSignal, useNow, useRestTimer, useWakeLock } from "./hooks";
import { PlateDialog } from "./plate-dialog";
import { RestTimerBar } from "./rest-timer-bar";
import { SessionNote } from "./session-note";
import { useSetSync } from "./use-set-sync";
import { WorkoutSummary } from "./workout-summary";
import {
  newSetFrom,
  parseReps,
  parseWeightKg,
  setsToPrefill,
  toDrafts,
  toGroupMember,
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
  /** Wem die Offline-Warteschlange auf diesem Gerät gehört. */
  userId: string;
  /** Abfrage nach jeder Übung (Einstellung unter Anpassungen). */
  checkIn: boolean;
}

interface SetRef {
  exerciseId: string;
  setId: string;
}

export function WorkoutScreen({ view, unitSystem, userId, checkIn }: WorkoutScreenProps) {
  const t = useTranslations();
  const router = useRouter();
  /** Ohne Netz beendet: Zeitpunkt des Endes, bis der Server es bestätigt hat. */
  const [localFinish, setLocalFinish] = useState<string | null>(null);
  const inProgress = view.status === "in_progress" && localFinish === null;
  const [exercises, dispatch] = useReducer(workoutReducer, view.exercises, toDrafts);
  const sync = useSetSync(exercises);
  const alertSignal = useAlertSignal();
  const timer = useRestTimer(alertSignal.signal);
  useRestPush(inProgress ? timer.endsAt : null);
  const now = useNow(inProgress);
  useWakeLock(inProgress);

  const [invalid, setInvalid] = useState<InvalidField | null>(null);
  const [optionsFor, setOptionsFor] = useState<SetRef | null>(null);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [platesFor, setPlatesFor] = useState<string | null>(null);
  const [infoFor, setInfoFor] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"finish" | "delete" | null>(null);
  const [forgottenDismissed, setForgottenDismissed] = useState(false);
  const [pending, startTransition] = useTransition();

  const startedAt = new Date(view.startedAt);
  const openSets = exercises.reduce(
    (total, exercise) => total + exercise.sets.filter((set) => !set.completed).length,
    0,
  );
  const elapsedSeconds = now === null ? null : (now - startedAt.getTime()) / 1000;
  const finishedAt = view.finishedAt ?? localFinish;
  const durationMinutes = finishedAt
    ? Math.max(1, Math.round((new Date(finishedAt).getTime() - startedAt.getTime()) / 60000))
    : null;

  // Wartende Änderungen dieses Trainings über den geladenen Stand legen (z. B. nach Neuladen ohne Netz).
  const exerciseKey = view.exercises.map((exercise) => exercise.id).join(",");
  useEffect(() => {
    let cancelled = false;
    const engine = getSyncEngine();
    void engine
      .setUser(userId)
      .then(() => engine.list())
      .then((records) => {
        if (cancelled) return;
        const exerciseIds = new Set(exerciseKey.split(","));
        const operations = records.map((record) => record.operation);
        const saves = operations.flatMap((operation) =>
          operation.type === "set.save" && exerciseIds.has(operation.payload.workoutExerciseId)
            ? [operation.payload]
            : [],
        );
        const deletedSetIds = operations.flatMap((operation) =>
          operation.type === "set.delete" ? [operation.payload.setId] : [],
        );
        const feedback = operations.flatMap((operation) =>
          operation.type === "exercise.feedback" ? [operation.payload] : [],
        );
        if (saves.length > 0 || deletedSetIds.length > 0 || feedback.length > 0) {
          dispatch({ type: "restore", changes: { saves, deletedSetIds, feedback } });
        }
        const finish = operations.find(
          (operation) => operation.type === "workout.finish" && operation.payload.sessionId === view.id,
        );
        if (finish && view.status === "in_progress") setLocalFinish(finish.at);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, view.id, view.status, exerciseKey]);

  // Ist alles übertragen, merkt sich der Service Worker die Seite für den nächsten Start ohne Netz.
  useEffect(() => {
    if (sync.pending > 0) return;
    tellServiceWorker({ type: "cache-page", url: window.location.pathname });
    // Ein ohne Netz beendetes Training ist jetzt auch auf dem Server beendet: frischen Stand laden.
    if (localFinish !== null) router.refresh();
  }, [sync.pending, localFinish, router]);

  const findSet = (ref: SetRef) => {
    const exercise = exercises.find((item) => item.id === ref.exerciseId);
    const set = exercise?.sets.find((item) => item.id === ref.setId);
    return exercise && set ? { exercise, set } : null;
  };

  /** Abfrage nach der Übung: über die Warteschlange, damit sie auch ohne Netz ankommt. */
  function saveFeedback(exerciseId: string, feedback: ExerciseFeedback) {
    dispatch({ type: "feedback", exerciseId, feedback });
    const engine = getSyncEngine();
    void engine
      .enqueue({ type: "exercise.feedback", payload: { workoutExerciseId: exerciseId, ...feedback } })
      .then(() => engine.syncNow());
  }

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
      if (exercise.type === "weight_reps" && parseWeightKg(set, exercise.unit) === null) {
        setInvalid({ setId, field: "weight" });
        toast.error(t("workout.needsWeight"));
        return;
      }
    }
    dispatch({ type: "edit", exerciseId, setId, patch: { completed: !set.completed } });
    sync.schedule(setId, true);
    setInvalid(null);
    if (set.completed) return;
    // Noch leere Folgesätze gleicher Art übernehmen die Werte: So genügt danach ein Tipp pro Satz.
    for (const later of setsToPrefill(exercise.sets, set)) {
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
    if (openSets <= 1) {
      timer.stop();
      return;
    }
    if (set.type === "warmup") {
      timer.start(Math.min(exercise.restSeconds, WARMUP_REST_SECONDS));
      return;
    }
    // Supersatz/Zirkel: Die Pause läuft erst, wenn alle Übungen der Gruppe den Durchgang haben.
    const members = exercises.map((item) => {
      const member = toGroupMember(item);
      return item.id === exerciseId ? { ...member, completedSets: member.completedSets + 1 } : member;
    });
    const next = afterSetCompleted(members, exerciseId);
    if (!next.rest && next.nextId) {
      timer.stop();
      const upcoming = exercises.find((item) => item.id === next.nextId);
      if (upcoming) toast.info(t("workout.group.next", { name: upcoming.name }));
      document.getElementById(`exercise-${next.nextId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const group = exercise.groupId ? exercises.filter((item) => item.groupId === exercise.groupId) : [exercise];
    timer.start(groupRestSeconds(group.map((item) => item.restSeconds)));
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
    // Bei Unterstützung (z. B. Klimmzug-Maschine) wären 40–80 % des Werts weniger Hilfe, also schwerer.
    if (isAssisted(exercise.type)) {
      toast.info(t("workout.warmupAssisted"));
      return;
    }
    const firstWork = exercise.sets.find((set) => set.type !== "warmup");
    const workWeightKg = firstWork ? parseWeightKg(firstWork, exercise.unit) : null;
    if (workWeightKg === null || workWeightKg <= 0) {
      toast.error(t("workout.warmupNeedsWeight"));
      return;
    }
    const hasWarmup = exercise.sets.some((set) => set.type === "warmup");
    const suggested = hasWarmup ? [] : warmupSets(workWeightKg, exercise.incrementKg, exercise.minWeightKg);
    if (suggested.length === 0) {
      toast.info(t("workout.warmupNotNeeded"));
      return;
    }
    const drafts: SetDraft[] = suggested.map((warmup) => ({
      id: crypto.randomUUID(),
      type: "warmup",
      weightText: toInputText(toDisplayWeight(warmup.weightKg, unitSystemOf(exercise.unit))),
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
    sync.remove(ref.setId);
    for (const set of found.exercise.sets) if (set.id !== ref.setId) sync.schedule(set.id, true);
  }

  function finish(finishedAt?: Date) {
    setConfirm(null);
    timer.stop();
    const at = finishedAt ?? new Date();
    startTransition(async () => {
      await sync.flushAll();
      const engine = getSyncEngine();
      await engine.enqueue({ type: "workout.finish", payload: { sessionId: view.id } }, at);
      // Mit Netz ist das Training sofort beendet; ohne Netz gilt es auf dem Gerät als beendet
      // und wird nachgetragen, sobald wieder Verbindung besteht.
      if (await engine.syncNow()) router.refresh();
      else setLocalFinish(at.toISOString());
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
  const title = view.name ?? (view.focus ? t(`training.focus.${view.focus}`) : t("training.focus.free"));
  const platesExercise = exercises.find((exercise) => exercise.id === platesFor) ?? null;
  const infoExercise = exercises.find((exercise) => exercise.id === infoFor) ?? null;
  const renderCard = (exercise: (typeof exercises)[number]) => (
    <ExerciseCard
      key={exercise.id}
      exercise={exercise}
      invalid={invalid}
      onEdit={(setId, patch) => edit(exercise.id, setId, patch)}
      onToggle={(setId) => toggle(exercise.id, setId)}
      onOpenOptions={(setId) => setOptionsFor({ exerciseId: exercise.id, setId })}
      onAddSet={() => addSet(exercise.id)}
      onAddWarmup={() => addWarmup(exercise.id)}
      onEditNote={() => setNoteFor(exercise.exerciseId)}
      onOpenInfo={() => setInfoFor(exercise.id)}
      onOpenPlates={exercise.bar ? () => setPlatesFor(exercise.id) : undefined}
      checkIn={checkIn && inProgress}
      onFeedback={(feedback) => saveFeedback(exercise.id, feedback)}
    />
  );

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
                    minutes: Math.ceil(estimateRemainingSeconds(exercises) / 60),
                  })
                : formatDayLong(view.date)}
            </p>
          </div>
          {view.isDeload ? <Badge variant="secondary">{t("workout.deload")}</Badge> : null}
          {view.isShort ? <Badge variant="secondary">{t("workout.short")}</Badge> : null}
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
        {localFinish !== null ? (
          <Alert>
            <AlertTitle>{t("workout.sync.finishedOfflineTitle")}</AlertTitle>
            <AlertDescription>{t("workout.sync.finishedOfflineText")}</AlertDescription>
          </Alert>
        ) : null}
        {sync.failed ? (
          <Alert role="status">
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              {t("workout.sync.error", { count: sync.pending })}
              <Button size="sm" variant="outline" onClick={() => void sync.flushAll()}>
                {t("workout.sync.retry")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}
        {inProgress ? null : (
          <WorkoutSummary exercises={exercises} durationMinutes={durationMinutes} unitSystem={unitSystem} />
        )}

        {groupConsecutive(exercises).map((group) => {
          const kind = groupKind(group.items.length);
          if (!kind || group.groupId === null) return group.items.map(renderCard);
          return (
            <section
              key={group.groupId}
              aria-label={t(`workout.group.${kind}`)}
              className="border-primary grid gap-3 border-l-[3px] pl-2"
            >
              <p className="text-primary text-sm font-semibold">
                {t(`workout.group.${kind}`)}
                {" · "}
                <span className="text-muted-foreground font-normal">{t("workout.group.hint")}</span>
              </p>
              {group.items.map(renderCard)}
            </section>
          );
        })}

        <SessionNote sessionId={view.id} initialNote={view.note} />
        <div className="flex flex-wrap gap-3">
          {inProgress ? null : (
            <>
              <Button asChild variant="outline">
                <Link href="/training">{t("workout.summary.toPlan")}</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`/progress/photos?session=${view.id}`}>
                  <CameraIcon aria-hidden />
                  {t("progress.photos.addToWorkout")}
                </Link>
              </Button>
            </>
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
      <PlateDialog exercise={platesExercise} onClose={() => setPlatesFor(null)} />
      <ExerciseInfoDialog exercise={infoExercise} onClose={() => setInfoFor(null)} />
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
