import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { requireAdmin } from "@/features/auth/session";
import { DeleteUserButton } from "@/features/users/components/delete-user-button";
import { SetPasswordDialog } from "@/features/users/components/set-password-dialog";
import { CreateUserDialog, EditUserDialog } from "@/features/users/components/user-form-dialogs";
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
      <div className="mb-4">
        <CreateUserDialog />
      </div>
      <ul className="grid gap-3">
        {users.map((user) => {
          const isSelf = user.id === admin.id;
          return (
            <li key={user.id}>
              <Card>
                <CardContent className="grid gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="truncate">{user.name}</span>
                        {isSelf ? <Badge variant="outline">{t("you")}</Badge> : null}
                      </p>
                      <p className="text-muted-foreground truncate text-sm">
                        {t("username")}
                        {": "}
                        {user.username}
                      </p>
                    </div>
                    <Badge variant={user.role === "admin" ? "default" : "secondary"}>
                      {t(`roles.${user.role}`)}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <EditUserDialog user={user} isSelf={isSelf} />
                    {isSelf ? null : (
                      <>
                        <SetPasswordDialog userId={user.id} name={user.name} />
                        <DeleteUserButton userId={user.id} name={user.name} />
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
    </>
  );
}
