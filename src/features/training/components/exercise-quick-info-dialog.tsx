"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  EXERCISE_ILLUSTRATION_HEIGHT,
  EXERCISE_ILLUSTRATION_WIDTH,
  exerciseIllustrationPath,
} from "@/data/exercises/illustrations";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface ExerciseQuickInfoDialogProps {
  exerciseId: string;
  name: string;
  /** Kurze Anleitung, ein Schritt pro Eintrag; bei eigenen Übungen oft leer. */
  instructions: string[];
}

/** „i“ neben einer Übung: zeigt Illustration (falls vorhanden) und Ausführung, ohne die Ansicht zu verlassen. */
export function ExerciseQuickInfoDialog({ exerciseId, name, instructions }: ExerciseQuickInfoDialogProps) {
  const t = useTranslations("training.library");
  const illustration = exerciseIllustrationPath(exerciseId);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label={t("infoLabel", { name })}>
          <InfoIcon aria-hidden />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-8">{name}</DialogTitle>
          <DialogDescription>{instructions.length > 0 ? t("instructions") : t("noInstructions")}</DialogDescription>
        </DialogHeader>
        {illustration ? (
          <Image
            src={illustration}
            alt={t("illustrationAlt", { name })}
            width={EXERCISE_ILLUSTRATION_WIDTH}
            height={EXERCISE_ILLUSTRATION_HEIGHT}
            className="w-full rounded-xl"
          />
        ) : null}
        {instructions.length > 0 ? (
          <ol className="list-decimal space-y-2 pl-5">
            {instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
