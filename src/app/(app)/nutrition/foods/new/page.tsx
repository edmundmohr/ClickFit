import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { parseAddTarget, targetQuery } from "@/features/nutrition/add-target";
import { CustomFoodForm } from "@/features/nutrition/components/custom-food-form";
import { toLocalDate } from "@/lib/dates";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nutrition.food");
  return { title: t("newTitle") };
}

export default async function NewFoodPage({ searchParams }: PageProps<"/nutrition/foods/new">) {
  await requireUser();
  const t = await getTranslations("nutrition");
  const params = await searchParams;
  const target = parseAddTarget(params, toLocalDate(new Date()));
  const addHref = `/nutrition/add?${targetQuery(target)}`;
  const barcode = typeof params.barcode === "string" && /^\d{6,14}$/.test(params.barcode) ? params.barcode : "";

  return (
    <>
      <Link href={addHref} className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("add.back")}
      </Link>
      <PageHeader title={t("food.newTitle")} />
      <CustomFoodForm returnTo={addHref} initialBarcode={barcode} />
    </>
  );
}
