import { AppShell } from "@/components/layout/app-shell";
import { OfflineSync } from "@/components/offline-sync";
import { requireUser } from "@/features/auth/session";
import { ThemeSync } from "@/features/users/components/theme-sync";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <AppShell>
      <ThemeSync theme={user.theme} />
      <OfflineSync userId={user.id} />
      {children}
    </AppShell>
  );
}
