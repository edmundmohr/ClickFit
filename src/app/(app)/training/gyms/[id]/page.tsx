import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeftIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { GymForm } from "@/features/training/components/gyms/gym-form";
import { getGym } from "@/features/training/services/gym-service";
import { DEFAULT_EQUIPMENT } from "@/features/training/services/profile-service";
import { AppError } from "@/lib/errors";
import { getDb } from "@/lib/server/context";

/** Unter dieser Kennung wird ein neuer Ort angelegt. */
const NEW_ID = "new";

export async function generateMetadata({ params }: PageProps<"/training/gyms/[id]">): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations("gyms.form");
  return { title: t(id === NEW_ID ? "newTitle" : "editTitle") };
}

export default async function GymPage({ params }: PageProps<"/training/gyms/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTranslations("gyms");
  const gym =
    id === NEW_ID
      ? null
      : await getGym(getDb(), user.id, id).catch((error: unknown) => {
          if (error instanceof AppError && error.code === "NOT_FOUND") return notFound();
          throw error;
        });

  return (
    <>
      <Link href="/training/gyms" className="text-muted-foreground mb-3 inline-flex min-h-11 items-center gap-1 text-sm">
        <ArrowLeftIcon className="size-4" aria-hidden />
        {t("back")}
      </Link>
      <PageHeader title={t(gym ? "form.editTitle" : "form.newTitle")} />
      <GymForm
        gym={gym}
        defaultUnit={user.unitSystem === "imperial" ? "lbs" : "kg"}
        defaultEquipment={DEFAULT_EQUIPMENT}
      />
    </>
  );
}
