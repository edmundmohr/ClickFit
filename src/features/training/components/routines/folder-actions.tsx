"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArchiveIcon, ArchiveRestoreIcon, FolderPlusIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { Field } from "@/components/forms/field";
import { useActionRunner } from "@/hooks/use-action-runner";
import {
  createFolderAction,
  createRoutineAction,
  deleteFolderAction,
  renameFolderAction,
  setPlanStatusAction,
} from "../../flex-actions";

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
  const router = useRouter();
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
        onSubmit={(name) => run(() => createFolderAction(name), (planId) => router.push(`/training/plans/${planId}`))}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

/** „Routine hinzufügen“ unter der Liste eines Plans; öffnet danach gleich den Editor. */
export function AddRoutineButton({ folderId }: { folderId: string }) {
  const t = useTranslations("routines");
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="min-h-11" onClick={() => setOpen(true)}>
        <PlusIcon aria-hidden />
        {t("newRoutine")}
      </Button>
      <NameDialog
        open={open}
        title={t("newRoutineTitle")}
        label={t("routineName")}
        placeholder={t("routineNamePlaceholder")}
        confirmLabel={t("create")}
        pending={pending}
        onSubmit={(value) =>
          run(
            () => createRoutineAction(folderId, value),
            (routineId) => router.push(`/training/routines/${routineId}`),
          )
        }
        onClose={() => setOpen(false)}
      />
    </>
  );
}

interface PlanManageActionsProps {
  folderId: string;
  title: string;
  /** Eigener Name des Plans; leer bei erzeugten Plänen. */
  name: string;
  /** Der Hauptplan lässt sich nicht archivieren. */
  isMain: boolean;
}

/** Umbenennen und Archivieren am Ende der Plan-Seite. */
export function PlanManageActions({ folderId, title, name, isMain }: PlanManageActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        {isMain ? t("routines.archiveMainText") : t("routines.archiveText")}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className="min-h-11" onClick={() => setRenaming(true)}>
          <PencilIcon aria-hidden />
          {t("routines.rename")}
        </Button>
        {isMain ? null : (
          <Button
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() =>
              run(
                () => setPlanStatusAction(folderId, "archived"),
                () => {
                  toast.success(t("routines.archivedToast", { name: title }));
                  router.push("/training/plans");
                },
              )
            }
          >
            <ArchiveIcon aria-hidden />
            {t("routines.archive")}
          </Button>
        )}
      </div>
      <NameDialog
        open={renaming}
        title={t("routines.renameTitle")}
        label={t("routines.folderName")}
        initial={name}
        confirmLabel={t("common.save")}
        pending={pending}
        onSubmit={(value) => run(() => renameFolderAction(folderId, value), () => setRenaming(false))}
        onClose={() => setRenaming(false)}
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
