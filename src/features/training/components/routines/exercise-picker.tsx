"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { PickerExercise } from "./editor-state";

const MAX_RESULTS = 40;

interface ExercisePickerProps {
  exercises: PickerExercise[];
  /** Bereits in der Routine enthaltene Übungen erscheinen nicht noch einmal. */
  usedIds: ReadonlySet<string>;
  onPick: (exercise: PickerExercise) => void;
}

/** Dialog zum Suchen und Hinzufügen einer Übung aus der Bibliothek (samt eigener Übungen). */
export function ExercisePicker({ exercises, usedIds, onPick }: ExercisePickerProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exercises.filter(
      (exercise) =>
        !usedIds.has(exercise.id) &&
        (needle === "" || exercise.name.toLowerCase().includes(needle) || exercise.muscles.toLowerCase().includes(needle)),
    );
  }, [exercises, query, usedIds]);

  return (
    <>
      <Button type="button" variant="outline" size="lg" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        {t("routines.editor.add")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <DialogContent className="flex max-h-[85dvh] flex-col">
          <DialogHeader>
            <DialogTitle>{t("routines.editor.addTitle")}</DialogTitle>
          </DialogHeader>
          <Input
            type="search"
            aria-label={t("routines.editor.search")}
            placeholder={t("routines.editor.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <ul className="-mx-2 min-h-0 flex-1 divide-y overflow-y-auto">
            {matches.slice(0, MAX_RESULTS).map((exercise) => (
              <li key={exercise.id}>
                <button
                  type="button"
                  onClick={() => onPick(exercise)}
                  className="hover:bg-accent/60 flex min-h-14 w-full items-center gap-2 px-2 py-2 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{exercise.name}</span>
                    <span className="text-muted-foreground block truncate text-sm">{exercise.muscles}</span>
                  </span>
                  {exercise.custom ? <Badge variant="secondary">{t("training.library.custom")}</Badge> : null}
                  <PlusIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          {matches.length === 0 ? <p className="text-sm">{t("routines.editor.noResults")}</p> : null}
          {matches.length > MAX_RESULTS ? (
            <p className="text-muted-foreground text-xs">{t("routines.editor.more")}</p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
