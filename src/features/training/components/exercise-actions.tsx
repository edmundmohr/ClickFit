"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BanIcon, CheckIcon, PencilIcon, Trash2Icon } from "lucide-react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { deleteCustomExerciseAction, setExerciseExcludedAction } from "../flex-actions";

interface ExerciseActionsProps {
  exerciseId: string;
  excluded: boolean;
  /** Ausschließen setzt ein Profil voraus. */
  canExclude: boolean;
  custom: boolean;
}

/** Übung ausschließen bzw. wieder zulassen; eigene Übungen bearbeiten und löschen. */
export function ExerciseActions({ exerciseId, excluded, canExclude, custom }: ExerciseActionsProps) {
  const t = useTranslations();
  const router = useRouter();
  const { run, pending } = useActionRunner();

  return (
    <div className="flex flex-wrap gap-2">
      {canExclude ? (
        <Button
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () => setExerciseExcludedAction(exerciseId, !excluded),
              () => toast.success(t(excluded ? "training.library.includeDone" : "training.library.excludeDone")),
            )
          }
        >
          {excluded ? <CheckIcon aria-hidden /> : <BanIcon aria-hidden />}
          {t(excluded ? "training.library.include" : "training.library.exclude")}
        </Button>
      ) : null}
      {custom ? (
        <>
          <Button asChild variant="outline">
            <Link href={`/training/exercises/${exerciseId}/edit`}>
              <PencilIcon aria-hidden />
              {t("training.library.editCustom")}
            </Link>
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" className="text-destructive" disabled={pending}>
                <Trash2Icon aria-hidden />
                {t("training.library.deleteCustom")}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("training.library.deleteCustomTitle")}</AlertDialogTitle>
                <AlertDialogDescription>{t("training.library.deleteCustomText")}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    run(
                      () => deleteCustomExerciseAction(exerciseId),
                      () => {
                        toast.success(t("training.library.customDeleted"));
                        router.push("/training/exercises");
                      },
                    )
                  }
                >
                  {t("common.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      ) : null}
    </div>
  );
}
