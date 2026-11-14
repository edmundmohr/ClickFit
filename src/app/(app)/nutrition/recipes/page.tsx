import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ChevronRightIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { RecipeForm } from "@/features/nutrition/components/recipe-forms";
import { listRecipes } from "@/features/nutrition/services/recipe-service";
import { formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nutrition.recipes");
  return { title: t("title") };
}

export default async function RecipesPage() {
  const user = await requireUser();
  const t = await getTranslations("nutrition.recipes");
  const recipes = await listRecipes(getDb(), user.id);

  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-4">
        {recipes.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {recipes.map((recipe) => (
              <li key={recipe.id}>
                <Link href={`/nutrition/recipes/${recipe.id}`} className="hover:bg-accent/60 flex min-h-14 items-center gap-2 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{recipe.name}</span>
                    <span className="text-muted-foreground block text-sm">
                      {t("summary", {
                        servings: recipe.servings,
                        kcal: formatNumber(recipe.summary.perServing.kcal, 0),
                      })}
                    </span>
                  </span>
                  <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Card>
          <CardHeader>
            <CardTitle>{t("new")}</CardTitle>
          </CardHeader>
          <CardContent>
            <RecipeForm name="" servings={1} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
