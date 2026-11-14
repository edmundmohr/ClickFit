"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { saveSessionNoteAction } from "../../actions";

export function SessionNote({ sessionId, initialNote }: { sessionId: string; initialNote: string }) {
  const t = useTranslations();
  const [note, setNote] = useState(initialNote);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveSessionNoteAction(sessionId, note);
      if (result.ok) toast.success(t("workout.noteSaved"));
      else toast.error(t(`errors.${result.error}`));
    });
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor="session-note">{t("workout.sessionNote")}</Label>
      <textarea
        id="session-note"
        value={note}
        rows={2}
        maxLength={500}
        placeholder={t("workout.sessionNotePlaceholder")}
        onChange={(event) => setNote(event.target.value)}
        className="border-input bg-background w-full rounded-md border px-3 py-2 text-base"
      />
      <Button variant="outline" size="sm" onClick={save} disabled={pending} className="justify-self-start">
        {pending ? t("common.saving") : t("common.save")}
      </Button>
    </div>
  );
}
