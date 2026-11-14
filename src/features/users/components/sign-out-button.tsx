import { getTranslations } from "next-intl/server";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "../actions";

export async function SignOutButton() {
  const t = await getTranslations("nav");
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" className="w-full justify-start" size="lg">
        <LogOutIcon aria-hidden />
        {t("signOut")}
      </Button>
    </form>
  );
}
