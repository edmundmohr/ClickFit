import Link from "next/link";
import { useTranslations } from "next-intl";
import { HeartPulseIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { HeartRateZoneRange } from "@/domain/cardio/zones";

export interface ZoneProfile {
  age: number;
  maxBpm: number;
  zones: HeartRateZoneRange[];
}

/** Puls-Zonen des Nutzers aus dem Geburtsjahr; ohne Profil ein Hinweis auf den Fragebogen. */
export function ZonesCard({ profile }: { profile: ZoneProfile | null }) {
  const t = useTranslations("cardio");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulseIcon className="text-muted-foreground size-5" aria-hidden />
          {t("zones.title")}
        </CardTitle>
        <CardDescription>
          {profile ? t("zones.maxHeartRate", { value: profile.maxBpm, age: profile.age }) : t("zones.noProfile")}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {profile ? (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-left text-xs">
                  <th scope="col" className="py-1 pr-2 font-normal">
                    {t("zones.zone")}
                  </th>
                  <th scope="col" className="px-2 py-1 text-right font-normal">
                    {t("zones.share")}
                  </th>
                  <th scope="col" className="py-1 pl-2 text-right font-normal">
                    {t("zones.bpm")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {profile.zones.map((range) => (
                  <tr key={range.zone} className="border-t">
                    <th scope="row" className="py-2 pr-2 text-left font-normal">
                      <span className="font-medium">{range.zone}</span>
                      <span className="text-muted-foreground">{` · ${t(`zoneNames.${range.zone}`)}`}</span>
                    </th>
                    <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums">
                      {t("zones.percent", { min: range.minPercent, max: range.maxPercent })}
                    </td>
                    <td className="py-2 pl-2 text-right whitespace-nowrap tabular-nums">
                      {t("values.bpmRange", { min: range.minBpm, max: range.maxBpm })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-muted-foreground text-xs">{t("zones.hint")}</p>
          </>
        ) : (
          <Button asChild variant="outline" className="w-full">
            <Link href="/onboarding">{t("zones.toOnboarding")}</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
