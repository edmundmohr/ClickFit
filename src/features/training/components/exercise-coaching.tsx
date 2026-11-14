import { CheckIcon, ChevronRightIcon, XIcon } from "lucide-react";
import { splitMistake } from "@/domain/exercises/coaching";

/**
 * Kurzbefehle und typische Fehler einer Übung. Ohne Hooks, damit Übungsseite (Server)
 * und Trainingsmodus (Client) dieselbe Darstellung nutzen. Überschriften setzt der Aufrufer.
 */

export function CueList({ cues }: { cues: readonly string[] }) {
  return (
    <ul className="grid gap-2">
      {cues.map((cue) => (
        <li key={cue} className="bg-secondary flex min-h-11 items-center gap-2 rounded-md px-3 py-2 font-medium">
          <ChevronRightIcon className="text-primary size-4 shrink-0" aria-hidden />
          {cue}
        </li>
      ))}
    </ul>
  );
}

export function MistakeList({ mistakes }: { mistakes: readonly string[] }) {
  return (
    <ul className="grid gap-3">
      {mistakes.map((mistake) => {
        const { fault, fix } = splitMistake(mistake);
        return (
          <li key={mistake} className="grid gap-1">
            <p className="flex items-start gap-2 font-medium">
              <XIcon className="text-destructive mt-1 size-4 shrink-0" aria-hidden />
              {fault}
            </p>
            {fix ? (
              <p className="text-muted-foreground flex items-start gap-2 text-sm">
                <CheckIcon className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
                {fix}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
