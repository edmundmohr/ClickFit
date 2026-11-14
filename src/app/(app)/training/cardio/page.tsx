import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { CardioBoard } from "@/features/cardio/components/cardio-board";
import { ZonesCard, type ZoneProfile } from "@/features/cardio/components/zones-card";
import { getWeekSummary, listActivities } from "@/features/cardio/services/activity-service";
import { listCardioPlan } from "@/features/cardio/services/cardio-plan-service";
import { getProfile } from "@/features/training/services/profile-service";
import { ageFromBirthYear, heartRateZones, maxHeartRate } from "@/domain/cardio/zones";
import { addDays, toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("cardio");
  return { title: t("title") };
}

const RECENT_DAYS = 30;

export default async function CardioPage() {
  const user = await requireUser();
  const t = await getTranslations("cardio");
  const today = toLocalDate(new Date());
  const db = getDb();
  const [stored, plan, activities, week] = await Promise.all([
    getProfile(db, user.id),
    listCardioPlan(db, user.id),
    listActivities(db, user.id, addDays(today, 1 - RECENT_DAYS), today),
    getWeekSummary(db, user.id, today),
  ]);

  let zoneProfile: ZoneProfile | null = null;
  if (stored) {
    const age = ageFromBirthYear(stored.profile.birthYear, Number(today.slice(0, 4)));
    const maxBpm = maxHeartRate(age);
    zoneProfile = { age, maxBpm, zones: heartRateZones(maxBpm) };
  }

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="grid gap-4">
        <CardioBoard
          today={today}
          week={week}
          plan={plan}
          activities={activities}
          recentDays={RECENT_DAYS}
          zones={zoneProfile?.zones ?? null}
          maxBpm={zoneProfile?.maxBpm ?? null}
        />
        <ZonesCard profile={zoneProfile} />
      </div>
    </>
  );
}
