import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon, PlusIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { DeleteRecipeButton, RecipeForm, RemoveIngredientButton } from "@/features/nutrition/components/recipe-forms";
import { RECIPE_PREFIX } from "@/features/nutrition/food-catalog";
import { getRecipe } from "@/features/nutrition/services/recipe-service";
import { scaleMacros } from "@/domain/nutrition/macros";
import { MEALS, type Macros } from "@/domain/nutrition/types";
import { toLocalDate } from "@/lib/dates";
import { AppError } from "@/lib/errors";
import { formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nutrition.recipes");
  return { title: t("title") };
}

export default async function RecipePage({ params }: PageProps<"/nutrition/recipes/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const recipe = await getRecipe(getDb(), user.id, id).catch((error: unknown) => {
    if (error instanceof AppError && error.code === "NOT_FOUND") return null;
    throw error;
  });
  if (!recipe) notFound();

  const t = await getTranslations("nutrition");
  const today = toLocalDate(new Date());
  const { summary } = recipe;
  const macroLine = (macros: Macros) =>
    t("macros.line", {
      kcal: formatNumber(macros.kcal, 0),
      protein: formatNumber(macros.proteinG, 0),
      carbs: formatNumber(macros.carbsG, 0),
      fat: formatNumber(macros.fatG, 0),
    });
  const rows = [
    { label: t("recipes.perServing"), macros: summary.perServing },
    { label: t("recipes.total"), macros: summary.total },
    ...(summary.totalWeightG
      ? [{ label: t("recipes.per100g"), macros: scaleMacros(summary.total, 100 / summary.totalWeightG) }]
      : []),
  ];

  return (
    <>
      <Link href="/nutrition/recipes" className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("recipes.back")}
      </Link>
      <PageHeader title={recipe.name} />
      <div className="grid gap-4">
        <Card>
          <CardContent className="grid gap-4">
            <RecipeForm key={`${recipe.name}-${recipe.servings}`} recipeId={recipe.id} name={recipe.name} servings={recipe.servings} />
            <dl className="grid gap-2 text-sm">
              {rows.map((row) => (
                <div key={row.label}>
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="tabular-nums">{macroLine(row.macros)}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("recipes.ingredients")}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {recipe.ingredients.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t("recipes.noIngredients")}</p>
            ) : (
              <ul className="divide-y">
                {recipe.ingredients.map((ingredient) => (
                  <li key={ingredient.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{ingredient.name}</span>
                      <span className="text-muted-foreground block text-xs">
                        {formatNumber(ingredient.amount)} {t(`units.${ingredient.amountUnit}`)}
                        {" · "}
                        {t("macros.kcalValue", { value: formatNumber(ingredient.kcal, 0) })}
                      </span>
                    </span>
                    <RemoveIngredientButton ingredientId={ingredient.id} name={ingredient.name} />
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="outline">
              <Link href={`/nutrition/add?target=recipe&recipeId=${recipe.id}`}>
                <PlusIcon aria-hidden />
                {t("recipes.addIngredient")}
              </Link>
            </Button>
          </CardContent>
        </Card>
        {recipe.ingredients.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("recipes.logTitle")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {MEALS.map((meal) => (
                <Button key={meal} asChild variant="outline">
                  <Link href={`/nutrition/add?target=log&date=${today}&meal=${meal}&ref=${RECIPE_PREFIX}${recipe.id}`}>
                    {t("recipes.logTo", { meal: t(`meals.${meal}`) })}
                  </Link>
                </Button>
              ))}
            </CardContent>
          </Card>
        ) : null}
        <div>
          <DeleteRecipeButton recipeId={recipe.id} />
        </div>
      </div>
    </>
  );
}
