"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  CalendarMinusIcon,
  CalendarPlusIcon,
  FolderPlusIcon,
  MapPinIcon,
  MoreVerticalIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";
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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/forms/field";
import { useActionRunner } from "@/hooks/use-action-runner";
import type { PlanStatus } from "@/domain/training/plan-roles";
import {
  createFolderAction,
  createRoutineAction,
  deleteFolderAction,
  renameFolderAction,
  setPlanStatusAction,
} from "../../flex-actions";
import { PlanLocationDialog, type LocationOption } from "./plan-location-dialog";

interface NameDialogProps {
  open: boolean;
  title: string;
  label: string;
  placeholder?: string;
  initial?: string;
  confirmLabel: string;
  pending: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

const MAX_NAME_LENGTH = 40;

/** Kleiner Dialog, der nur einen Namen abfragt. */
function NameDialog({ open, title, label, placeholder, initial = "", confirmLabel, pending, onSubmit, onClose }: NameDialogProps) {
  const t = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {open ? (
          <NameForm
            label={label}
            placeholder={placeholder}
            initial={initial}
            pending={pending}
            onSubmit={onSubmit}
            footer={(disabled) => (
              <DialogFooter>
                <Button type="button" variant="outline" onClick={onClose}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={disabled}>
                  {confirmLabel}
                </Button>
              </DialogFooter>
            )}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface NameFormProps {
  label: string;
  placeholder?: string;
  initial: string;
  pending: boolean;
  onSubmit: (name: string) => void;
  footer: (disabled: boolean) => ReactNode;
}

function NameForm({ label, placeholder, initial, pending, onSubmit, footer }: NameFormProps) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <Field
        id="name-dialog-input"
        label={label}
        placeholder={placeholder}
        maxLength={MAX_NAME_LENGTH}
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      {footer(pending || trimmed === "")}
    </form>
  );
}

export function NewFolderButton() {
  const t = useTranslations("routines");
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="lg" variant="outline" onClick={() => setOpen(true)}>
        <FolderPlusIcon aria-hidden />
        {t("newFolder")}
      </Button>
      <NameDialog
        open={open}
        title={t("newFolderTitle")}
        label={t("folderName")}
        placeholder={t("folderNamePlaceholder")}
        confirmLabel={t("create")}
        pending={pending}
        onSubmit={(name) => run(() => createFolderAction(name), () => setOpen(false))}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

interface FolderActionsProps {
  folderId: string;
  title: string;
  /** Eigener Name des Plans; leer bei erzeugten Plänen. */
  name: string;
  status: PlanStatus;
  /** Fester Ort des Plans; `null` = Ort des Tages. */
  gymId: string | null;
  locations: LocationOption[];
}

type FolderDialog = "routine" | "rename" | "location" | null;

/**
 * „Routine hinzufügen“ und das Menü eines Plans: umbenennen, Ort festlegen, Rolle wechseln
 * (Haupt-, Zusatzplan, inaktiv) und archivieren. Der Hauptplan bleibt, bis ein anderer ihn ablöst.
 */
export function FolderActions({ folderId, title, name, status, gymId, locations }: FolderActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<FolderDialog>(null);
  const changeStatus = (target: PlanStatus, message: "madeMain" | "madeExtra" | "unscheduled" | "archivedToast") =>
    run(
      () => setPlanStatusAction(folderId, target),
      () => toast.success(t(`routines.${message}`, { name: title })),
    );

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        className="size-11"
        aria-label={t("routines.newRoutineIn", { name: title })}
        onClick={() => setDialog("routine")}
      >
        <PlusIcon aria-hidden />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-11" aria-label={t("routines.folderMenu", { name: title })}>
            <MoreVerticalIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {status === "active" ? null : (
            <DropdownMenuItem className="min-h-11" onSelect={() => changeStatus("active", "madeMain")}>
              <StarIcon aria-hidden />
              {t("routines.makeMain")}
            </DropdownMenuItem>
          )}
          {status === "saved" ? (
            <DropdownMenuItem className="min-h-11" onSelect={() => changeStatus("extra", "madeExtra")}>
              <CalendarPlusIcon aria-hidden />
              {t("routines.makeExtra")}
            </DropdownMenuItem>
          ) : null}
          {status === "extra" ? (
            <DropdownMenuItem className="min-h-11" onSelect={() => changeStatus("saved", "unscheduled")}>
              <CalendarMinusIcon aria-hidden />
              {t("routines.unschedule")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="min-h-11" onSelect={() => setDialog("location")}>
            <MapPinIcon aria-hidden />
            {t("routines.location")}
          </DropdownMenuItem>
          <DropdownMenuItem className="min-h-11" onSelect={() => setDialog("rename")}>
            <PencilIcon aria-hidden />
            {t("routines.rename")}
          </DropdownMenuItem>
          {status === "active" ? null : (
            <DropdownMenuItem className="min-h-11" onSelect={() => changeStatus("archived", "archivedToast")}>
              <ArchiveIcon aria-hidden />
              {t("routines.archive")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <NameDialog
        open={dialog === "routine"}
        title={t("routines.newRoutineTitle")}
        label={t("routines.routineName")}
        placeholder={t("routines.routineNamePlaceholder")}
        confirmLabel={t("routines.create")}
        pending={pending}
        onSubmit={(value) =>
          run(
            () => createRoutineAction(folderId, value),
            (routineId) => router.push(`/training/routines/${routineId}`),
          )
        }
        onClose={() => setDialog(null)}
      />
      <NameDialog
        open={dialog === "rename"}
        title={t("routines.renameTitle")}
        label={t("routines.folderName")}
        initial={name}
        confirmLabel={t("common.save")}
        pending={pending}
        onSubmit={(value) => run(() => renameFolderAction(folderId, value), () => setDialog(null))}
        onClose={() => setDialog(null)}
      />
      <PlanLocationDialog
        open={dialog === "location"}
        folderId={folderId}
        title={title}
        gymId={gymId}
        locations={locations}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

/** Aktionen eines Plans im Archiv: wiederherstellen oder endgültig löschen. */
export function ArchivedPlanActions({ folderId, title }: { folderId: string; title: string }) {
  const t = useTranslations();
  const { run, pending } = useActionRunner();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        variant="outline"
        className="min-h-11"
        disabled={pending}
        onClick={() =>
          run(
            () => setPlanStatusAction(folderId, "saved"),
            () => toast.success(t("routines.restored", { name: title })),
          )
        }
      >
        <ArchiveRestoreIcon aria-hidden />
        {t("routines.restore")}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="text-destructive size-11"
        aria-label={`${t("routines.deleteFolder")}: ${title}`}
        disabled={pending}
        onClick={() => setConfirmDelete(true)}
      >
        <Trash2Icon aria-hidden />
      </Button>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("routines.deleteFolderTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("routines.deleteFolderText", { name: title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => run(() => deleteFolderAction(folderId), () => toast.success(t("routines.folderDeleted")))}
            >
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
