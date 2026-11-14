"use client";

import { useTranslations } from "next-intl";
import { CheckIcon, MapPinIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { setPlanGymAction } from "../../flex-actions";

export interface LocationOption {
  id: string;
  name: string;
}

interface PlanLocationDialogProps {
  open: boolean;
  folderId: string;
  title: string;
  /** Aktueller fester Ort; `null` = Ort des Tages. */
  gymId: string | null;
  locations: LocationOption[];
  onClose: () => void;
}

/** Auswahl des festen Orts eines Plans: „Kein fester Ort“ oder einer der Trainingsorte. */
export function PlanLocationDialog({ open, folderId, title, gymId, locations, onClose }: PlanLocationDialogProps) {
  const t = useTranslations("routines");
  const { run, pending } = useActionRunner();
  const choose = (next: string | null) =>
    run(
      () => setPlanGymAction(folderId, next),
      () => {
        toast.success(t("locationSaved"));
        onClose();
      },
    );
  const options = [{ id: null, name: t("locationNone"), hint: t("locationNoneHint") }, ...locations.map((location) => ({ ...location, hint: null }))];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("locationTitle", { name: title })}</DialogTitle>
          <DialogDescription>{t("locationText")}</DialogDescription>
        </DialogHeader>
        <ul className="grid gap-2">
          {options.map((option) => {
            const selected = option.id === gymId;
            return (
              <li key={option.id ?? "none"}>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  aria-pressed={selected}
                  className={cn("h-auto min-h-11 w-full justify-start py-2 text-left", selected && "border-primary")}
                  onClick={() => (selected ? onClose() : choose(option.id))}
                >
                  {option.id === null ? null : <MapPinIcon aria-hidden />}
                  <span className="grid min-w-0 flex-1">
                    <span className="truncate">{option.name}</span>
                    {option.hint ? (
                      <span className="text-muted-foreground text-sm font-normal">{option.hint}</span>
                    ) : null}
                  </span>
                  {selected ? <CheckIcon className="text-primary" aria-hidden /> : null}
                </Button>
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
