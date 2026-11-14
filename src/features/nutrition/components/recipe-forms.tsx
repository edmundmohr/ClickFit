"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2Icon, XIcon } from "lucide-react";
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
import { Field } from "@/components/forms/field";
import { useActionRunner } from "@/hooks/use-action-runner";
import { parseDecimal } from "@/lib/units";
import { createRecipeAction, deleteRecipeAction, removeIngredientAction, updateRecipeAction } from "../actions";

/** Name und Anzahl der Portionen; legt ein Rezept an oder ändert es. */
export function RecipeForm({ recipeId, name, servings }: { recipeId?: string; name: string; servings: number }) {
  const t = useTranslations();
  const router = useRouter();
  const [values, setValues] = useState({ name, servings: String(servings).replace(".", ",") });
  const [pending, startTransition] = useTransition();
  const parsedServings = parseDecimal(values.servings);
  const valid = values.name.trim() !== "" && parsedServings !== null && parsedServings > 0;

  function submit() {
    if (!valid || parsedServings === null) return;
    const input = { name: values.name, servings: parsedServings };
    startTransition(async () => {
      if (recipeId) {
        const result = await updateRecipeAction(recipeId, input);
        if (result.ok) {
          toast.success(t("nutrition.recipes.saved"));
          router.refresh();
        } else {
          toast.error(t(`errors.${result.error}`));
        }
        return;
      }
      const result = await createRecipeAction(input);
      if (result.ok) {
        toast.success(t("nutrition.recipes.created"));
        router.push(`/nutrition/recipes/${result.data}`);
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <form
      className="grid grid-cols-[1fr_6rem] items-end gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Field id="recipe-name" label={t("nutrition.recipes.name")} value={values.name} maxLength={100} onChange={(event) => setValues({ ...values, name: event.target.value })} />
      <Field id="recipe-servings" label={t("nutrition.recipes.servings")} inputMode="decimal" value={values.servings} onChange={(event) => setValues({ ...values, servings: event.target.value })} />
      <Button type="submit" disabled={pending || !valid} className="col-span-2 justify-self-start">
        {recipeId ? t("nutrition.recipes.saveChanges") : t("nutrition.recipes.create")}
      </Button>
    </form>
  );
}

export function RemoveIngredientButton({ ingredientId, name }: { ingredientId: string; name: string }) {
  const t = useTranslations("nutrition.recipes");
  const { run, pending } = useActionRunner();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t("removeIngredient", { name })}
      disabled={pending}
      onClick={() => run(() => removeIngredientAction(ingredientId))}
    >
      <XIcon aria-hidden />
    </Button>
  );
}

export function DeleteRecipeButton({ recipeId }: { recipeId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await deleteRecipeAction(recipeId);
      if (result.ok) {
        toast.success(t("nutrition.recipes.deleted"));
        router.replace("/nutrition/recipes");
      } else {
        toast.error(t(`errors.${result.error}`));
      }
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" className="text-destructive" disabled={pending}>
          <Trash2Icon aria-hidden />
          {t("nutrition.recipes.delete")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("nutrition.recipes.deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("nutrition.recipes.deleteText")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={remove}>{t("common.delete")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
