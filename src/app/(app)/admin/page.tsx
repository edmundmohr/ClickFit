import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireAdmin } from "@/features/auth/session";
import { SetPasswordDialog } from "@/features/users/components/set-password-dialog";
import { listUsers } from "@/features/users/services/account-service";
import { getDb } from "@/lib/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("admin");
  return { title: t("title") };
}

export default async function AdminPage() {
  const admin = await requireAdmin();
  const t = await getTranslations("admin");
  const users = await listUsers(getDb(), admin);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <ul className="grid gap-3">
        {users.map((user) => (
          <li key={user.id}>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="truncate">{user.name}</span>
                    {user.id === admin.id ? <Badge variant="outline">{t("you")}</Badge> : null}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {t("username")}
                    {": "}
                    {user.username}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                    {t(`roles.${user.role}`)}
                  </Badge>
                  {user.id === admin.id ? null : (
                    <SetPasswordDialog userId={user.id} name={user.name} />
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </>
  );
}
