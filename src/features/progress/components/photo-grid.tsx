"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BodyFatSection, type BodyFatAi } from "@/features/ai/components/body-fat-section";
import type { BodyFatEstimateView } from "@/features/ai/services/body-fat-service";
import { useActionRunner } from "@/hooks/use-action-runner";
import { formatDayLong } from "@/lib/format";
import { deletePhotoAction } from "../actions";
import type { PhotoView } from "../services/photo-service";

interface PhotoGridProps {
  photos: PhotoView[];
  /** Datum des zugeordneten Trainings je Foto (Kennung des Trainings → Datum). */
  sessionDates: Record<string, string>;
  /** Vorhandene Körperfett-Schätzungen je Foto. */
  estimates: Record<string, BodyFatEstimateView>;
  /** `null`, wenn auf dem Server keine KI eingerichtet ist: Dann entfällt der Abschnitt. */
  ai: BodyFatAi | null;
}

/** Raster der eigenen Fotos; ein Tipp vergrößert, dort lässt sich das Foto löschen. */
export function PhotoGrid({ photos, sessionDates, estimates, ai }: PhotoGridProps) {
  const t = useTranslations("progress.photos");
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState<PhotoView | null>(null);
  const linkedDate = open?.sessionId ? sessionDates[open.sessionId] : undefined;

  return (
    <>
      <ul className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <li key={photo.id}>
            <button
              type="button"
              aria-label={t("open", { date: formatDayLong(photo.date) })}
              onClick={() => setOpen(photo)}
              className="bg-secondary block aspect-[3/4] w-full overflow-hidden rounded-lg"
            >
              {/* Private Bilder kommen über eine geschützte Route, nicht über den Bild-Optimierer. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${photo.id}`}
                alt={t("photoAlt", { date: formatDayLong(photo.date) })}
                loading="lazy"
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>
      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{formatDayLong(open.date)}</DialogTitle>
                <DialogDescription>
                  {[open.note, linkedDate ? t("linked", { date: formatDayLong(linkedDate) }) : null]
                    .filter(Boolean)
                    .join(" · ") || t("hint")}
                </DialogDescription>
              </DialogHeader>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/photos/${open.id}`}
                alt={t("photoAlt", { date: formatDayLong(open.date) })}
                className="w-full rounded-lg"
              />
              {ai ? <BodyFatSection key={open.id} photoId={open.id} estimate={estimates[open.id] ?? null} ai={ai} /> : null}
              <DialogFooter>
                <Button
                  variant="ghost"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => deletePhotoAction(open.id),
                      () => {
                        toast.success(t("deleted"));
                        setOpen(null);
                      },
                    )
                  }
                >
                  <Trash2Icon aria-hidden />
                  {t("delete")}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
