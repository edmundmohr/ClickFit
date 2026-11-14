import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PencilIcon, PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { GymActions } from "@/features/training/components/gyms/gym-actions";
import { listGyms } from "@/features/training/services/gym-service";
import { formatNumber } from "@/lib/format";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("gyms");
  return { title: t("title") };
}

export default async function GymsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const gyms = await listGyms(getDb(), user.id);

  return (
    <>
      <PageHeader title={t("gyms.title")} description={t("gyms.description")} />
      <div className="grid gap-4">
        {gyms.map((gym) => {
          const name = gym.name ?? t(`training.locations.${gym.type}`);
          return (
            <Card key={gym.id} className={gym.isActive ? "border-primary" : undefined}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="truncate text-lg">{name}</CardTitle>
                    <CardDescription>
                      {[
                        gym.name ? t(`training.locations.${gym.type}`) : null,
                        t("gyms.equipmentCount", { count: gym.equipment.length }),
                        gym.barWeight !== null && gym.plateUnit
                          ? t("gyms.ownBar", {
                              weight: formatNumber(gym.barWeight, 2),
                              unit: t(`training.units.${gym.plateUnit}`),
                            })
                          : null,
                        gym.weightRules.length > 0 ? t("gyms.rulesCount", { count: gym.weightRules.length }) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </CardDescription>
                  </div>
                  {gym.isActive ? <Badge>{t("gyms.active")}</Badge> : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Button asChild variant="outline">
                  <Link href={`/training/gyms/${gym.id}`}>
                    <PencilIcon aria-hidden />
                    {t("gyms.edit")}
                  </Link>
                </Button>
                <GymActions gymId={gym.id} name={name} isActive={gym.isActive} />
              </CardContent>
            </Card>
          );
        })}
        <Button asChild size="lg" variant="outline">
          <Link href="/training/gyms/new">
            <PlusIcon aria-hidden />
            {t("gyms.new")}
          </Link>
        </Button>
      </div>
    </>
  );
}
