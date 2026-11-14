import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { AiConsentCard } from "@/features/ai/components/ai-consent-card";
import { getAiStatus } from "@/features/ai/services/ai-service";
import { requireUser } from "@/features/auth/session";
import { PushCard } from "@/features/notifications/components/push-card";
import { toLocalDate } from "@/lib/dates";
import { getLlmProvider } from "@/lib/llm";
import { getDb, getEnv } from "@/lib/server/context";
import { ChangePasswordForm } from "@/features/users/components/change-password-form";
import { PreferencesForm } from "@/features/users/components/preferences-form";
import { ProfileForm } from "@/features/users/components/profile-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("title") };
}

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");
  // Ohne Schlüssel ist Web Push nicht eingerichtet: Dann entfällt die Karte.
  const env = getEnv();
  const vapidPublicKey: string | undefined = env.VAPID_PUBLIC_KEY;
  const tAi = await getTranslations("ai.settings");
  const ai = await getAiStatus(getDb(), getLlmProvider(env), user.id, toLocalDate(new Date()));
  const aiTitle = tAi("title");
  const aiDescription = tAi("description");
  return (
    <>
      <PageHeader title={t("title")} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("profile.title")}</CardTitle>
            <CardDescription>{t("profile.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm name={user.name} username={user.username} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("preferences.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PreferencesForm theme={user.theme} unitSystem={user.unitSystem} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("password.title")}</CardTitle>
            <CardDescription>{t("password.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("data.title")}</CardTitle>
            <CardDescription>{t("data.description")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/export">
                <DownloadIcon aria-hidden />
                {t("data.export")}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <a href="/api/me/export" download>
                {t("data.exportJson")}
              </a>
            </Button>
          </CardContent>
        </Card>
        {ai.available ? (
          <Card>
            <CardHeader>
              <CardTitle>{aiTitle}</CardTitle>
              <CardDescription>{aiDescription}</CardDescription>
            </CardHeader>
            <CardContent>
              <AiConsentCard status={ai} />
            </CardContent>
          </Card>
        ) : null}
        {vapidPublicKey ? (
          <Card>
            <CardHeader>
              <CardTitle>{t("push.title")}</CardTitle>
              <CardDescription>{t("push.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <PushCard publicKey={vapidPublicKey} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
