import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { DownloadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireUser } from "@/features/auth/session";
import { PushCard } from "@/features/notifications/components/push-card";
import { getEnv } from "@/lib/server/context";
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
  const vapidPublicKey: string | undefined = getEnv().VAPID_PUBLIC_KEY;
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
