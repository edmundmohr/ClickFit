"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/forms/choice";
import { SET_TYPES } from "@/domain/training/types";
import { CueList, MistakeList } from "../exercise-coaching";
import { ExerciseNoteForm } from "../exercise-note-form";
import type { ExerciseDraft, SetDraft } from "./workout-state";

interface SetOptionsDialogProps {
  set: SetDraft | null;
  number: number;
  onEdit: (patch: Partial<SetDraft>) => void;
  onDelete: () => void;
  onClose: () => void;
}

/** Satz-Typ, Notiz und Löschen für einen einzelnen Satz. */
export function SetOptionsDialog({ set, number, onEdit, onDelete, onClose }: SetOptionsDialogProps) {
  const t = useTranslations("workout");
  return (
    <Dialog open={set !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("options.title", { number })}</DialogTitle>
          <DialogDescription>{t("options.type")}</DialogDescription>
        </DialogHeader>
        {set ? (
          <div className="grid gap-4">
            <div role="radiogroup" className="grid grid-cols-2 gap-2">
              {SET_TYPES.map((type) => (
                <Chip key={type} role="radio" selected={set.type === type} onToggle={() => onEdit({ type })}>
                  {t(`setTypes.${type}`)}
                </Chip>
              ))}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="set-note">{t("options.note")}</Label>
              <Input
                id="set-note"
                value={set.note}
                maxLength={300}
                placeholder={t("options.notePlaceholder")}
                onChange={(event) => onEdit({ note: event.target.value })}
              />
            </div>
          </div>
        ) : null}
        <DialogFooter className="flex-row justify-between sm:justify-between">
          <Button variant="ghost" className="text-destructive" onClick={onDelete}>
            <Trash2Icon aria-hidden />
            {t("options.delete")}
          </Button>
          <Button onClick={onClose}>{t("options.done")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ExerciseNoteDialogProps {
  exercise: ExerciseDraft | null;
  onSaved: (note: string) => void;
  onClose: () => void;
}

export function ExerciseNoteDialog({ exercise, onSaved, onClose }: ExerciseNoteDialogProps) {
  const t = useTranslations();
  return (
    <Dialog open={exercise !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="pr-8">{t("workout.exerciseNoteTitle", { name: exercise?.name ?? "" })}</DialogTitle>
          <DialogDescription>{t("training.library.noteText")}</DialogDescription>
        </DialogHeader>
        {exercise ? (
          <ExerciseNoteForm
            key={exercise.exerciseId}
            exerciseId={exercise.exerciseId}
            initialNote={exercise.note}
            onSaved={(note) => {
              onSaved(note);
              onClose();
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface ExerciseInfoDialogProps {
  exercise: ExerciseDraft | null;
  onClose: () => void;
}

/** Kurzbefehle groß oben, typische Fehler darunter; die ganze Anleitung bleibt einen Tipp entfernt. */
export function ExerciseInfoDialog({ exercise, onClose }: ExerciseInfoDialogProps) {
  const t = useTranslations("training.library");
  const hasCoaching = exercise !== null && (exercise.cues.length > 0 || exercise.mistakes.length > 0);
  return (
    <Dialog open={exercise !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{exercise?.name ?? ""}</DialogTitle>
          {hasCoaching ? null : <DialogDescription>{t("noInstructions")}</DialogDescription>}
        </DialogHeader>
        {exercise && exercise.cues.length > 0 ? (
          <section className="grid gap-2">
            <h3 className="text-sm font-medium">{t("cues")}</h3>
            <CueList cues={exercise.cues} />
          </section>
        ) : null}
        {exercise && exercise.mistakes.length > 0 ? (
          <section className="grid gap-2">
            <h3 className="text-sm font-medium">{t("mistakes")}</h3>
            <MistakeList mistakes={exercise.mistakes} />
          </section>
        ) : null}
        {exercise ? (
          <Button asChild variant="outline">
            <Link href={`/training/exercises/${exercise.exerciseId}`}>{t("fullGuide")}</Link>
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  text: string;
  confirmLabel: string;
  cancelLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  open,
  title,
  text,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{text}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={destructive ? "bg-destructive hover:bg-destructive/90 text-white" : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
