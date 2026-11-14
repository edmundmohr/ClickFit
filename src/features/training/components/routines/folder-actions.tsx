"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FolderPlusIcon, MoreVerticalIcon, PencilIcon, PlusIcon, StarIcon, Trash2Icon } from "lucide-react";
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
import {
  activateFolderAction,
  createFolderAction,
  createRoutineAction,
  deleteFolderAction,
  renameFolderAction,
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
  /** Eigener Name des Ordners; leer bei erzeugten Plänen. */
  name: string;
  isActive: boolean;
}

type FolderDialog = "routine" | "rename" | "delete" | null;

/** „Routine hinzufügen“ und das Menü eines Ordners (Umbenennen, Wochenplan, Löschen). */
export function FolderActions({ folderId, title, name, isActive }: FolderActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<FolderDialog>(null);

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
          <DropdownMenuItem className="min-h-11" onSelect={() => setDialog("rename")}>
            <PencilIcon aria-hidden />
            {t("routines.rename")}
          </DropdownMenuItem>
          {isActive ? null : (
            <>
              <DropdownMenuItem
                className="min-h-11"
                onSelect={() => run(() => activateFolderAction(folderId), () => toast.success(t("routines.activated")))}
              >
                <StarIcon aria-hidden />
                {t("routines.activate")}
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive min-h-11" onSelect={() => setDialog("delete")}>
                <Trash2Icon aria-hidden />
                {t("routines.deleteFolder")}
              </DropdownMenuItem>
            </>
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
      <AlertDialog open={dialog === "delete"} onOpenChange={(open) => !open && setDialog(null)}>
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
