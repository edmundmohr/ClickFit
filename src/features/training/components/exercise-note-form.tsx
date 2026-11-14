"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveExerciseNoteAction } from "../actions";

const NOTE_MAX_LENGTH = 500;

interface ExerciseNoteFormProps {
  exerciseId: string;
  initialNote: string;
  onSaved?: (note: string) => void;
}

export function ExerciseNoteForm({ exerciseId, initialNote, onSaved }: ExerciseNoteFormProps) {
  const t = useTranslations();
  const [note, setNote] = useState(initialNote);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveExerciseNoteAction(exerciseId, note);
      if (result.ok) {
        toast.success(t("training.library.noteSaved"));
        onSaved?.(note.trim());
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <div className="grid gap-3">
      <textarea
        aria-label={t("training.library.notePlaceholder")}
        placeholder={t("training.library.notePlaceholder")}
        value={note}
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
        onChange={(event) => setNote(event.target.value)}
        className="border-input bg-background w-full rounded-md border px-3 py-2 text-base"
      />
      <Button type="button" onClick={save} disabled={pending} className="justify-self-start">
        {pending ? t("common.saving") : t("common.save")}
      </Button>
    </div>
  );
}
