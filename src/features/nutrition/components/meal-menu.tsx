"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { BookmarkPlusIcon, CopyIcon, EllipsisVerticalIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/forms/field";
import type { Meal } from "@/domain/nutrition/types";
import { useActionRunner } from "@/hooks/use-action-runner";
import { addDays, type LocalDate } from "@/lib/dates";
import { copyMealAction, saveMealAsRecipeAction } from "../actions";

interface MealMenuProps {
  date: LocalDate;
  meal: Meal;
  mealLabel: string;
  hasEntries: boolean;
}

/** Aktionen zu einer Mahlzeit: von gestern kopieren, als Rezept speichern. */
export function MealMenu({ date, meal, mealLabel, hasEntries }: MealMenuProps) {
  const t = useTranslations("nutrition");
  const { run, pending } = useActionRunner();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState(mealLabel);

  function copyYesterday() {
    run(
      () => copyMealAction(addDays(date, -1), date, meal),
      (count) => toast.info(t("diary.copied", { count })),
    );
  }

  function saveRecipe() {
    run(
      () => saveMealAsRecipeAction(date, meal, name),
      () => {
        toast.success(t("diary.recipeSaved"));
        setNaming(false);
      },
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("diary.menu", { meal: mealLabel })} disabled={pending}>
            <EllipsisVerticalIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={copyYesterday} className="min-h-11">
            <CopyIcon aria-hidden />
            {t("diary.copyYesterday")}
          </DropdownMenuItem>
          {hasEntries ? (
            <DropdownMenuItem onSelect={() => setNaming(true)} className="min-h-11">
              <BookmarkPlusIcon aria-hidden />
              {t("diary.saveAsRecipe")}
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={naming} onOpenChange={setNaming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("diary.saveAsRecipe")}</DialogTitle>
          </DialogHeader>
          <Field
            id={`recipe-name-${meal}`}
            label={t("diary.recipeName")}
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <DialogFooter>
            <Button onClick={saveRecipe} disabled={pending || name.trim() === ""}>
              {t("diary.saveAsRecipe")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
