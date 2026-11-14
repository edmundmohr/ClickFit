import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { parseAddTarget, returnHref, targetQuery } from "@/features/nutrition/add-target";
import { FoodPicker } from "@/features/nutrition/components/food-picker";
import { RECIPE_PREFIX } from "@/features/nutrition/food-catalog";
import { getSuggestions } from "@/features/nutrition/services/diary-service";
import { getFood, listCustomFoods } from "@/features/nutrition/services/food-service";
import { getRecipeAsFood, listRecipes } from "@/features/nutrition/services/recipe-service";
import type { FoodItem } from "@/domain/nutrition/types";
import { toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nutrition.add");
  return { title: t("title") };
}

export default async function AddFoodPage({ searchParams }: PageProps<"/nutrition/add">) {
  const user = await requireUser();
  const t = await getTranslations("nutrition");
  const today = toLocalDate(new Date());
  const params = await searchParams;
  const target = parseAddTarget(params, today);
  const db = getDb();
  const initialRef = typeof params.ref === "string" ? params.ref : null;

  const [suggestions, own, recipeViews, initialFood] = await Promise.all([
    getSuggestions(db, user.id),
    listCustomFoods(db, user.id),
    listRecipes(db, user.id),
    initialRef ? getFood(db, user.id, initialRef) : null,
  ]);
  const recipes = (
    await Promise.all(recipeViews.map((recipe) => getRecipeAsFood(db, user.id, recipe.id)))
  ).filter((item): item is FoodItem => item !== null);
  // Rezepte dürfen keine Rezepte enthalten: Das würde die Berechnung unübersichtlich machen.
  const withoutRecipes = (items: typeof suggestions.recent) =>
    target.target === "recipe" ? items.filter((item) => !item.foodRef.startsWith(RECIPE_PREFIX)) : items;

  const back = returnHref(target, today);
  const title =
    target.target === "recipe"
      ? t("add.titleRecipe")
      : target.target === "plan"
        ? t("add.titlePlan")
        : t("add.title");

  return (
    <>
      <Link href={back} className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("add.back")}
      </Link>
      <PageHeader title={title} description={target.target === "recipe" ? undefined : t(`meals.${target.meal}`)} />
      <FoodPicker
        target={target}
        returnTo={back}
        targetQuery={targetQuery(target)}
        recent={withoutRecipes(suggestions.recent)}
        frequent={withoutRecipes(suggestions.frequent)}
        own={own}
        recipes={recipes}
        initialFood={initialFood}
      />
    </>
  );
}
