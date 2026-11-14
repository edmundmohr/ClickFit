import { requireUser } from "@/features/auth/session";
import { ThemeSync } from "@/features/users/components/theme-sync";

/** Layout ohne Tab-Leiste: Im Trainingsmodus soll nichts ablenken. */
export default async function FocusLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <>
      <ThemeSync theme={user.theme} />
      {children}
    </>
  );
}
