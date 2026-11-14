"use client";

import { useTranslations } from "next-intl";
import { LogOutIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tellServiceWorker } from "@/lib/offline/client";
import { signOutAction } from "../actions";

export function SignOutButton() {
  const t = useTranslations("nav");
  return (
    // Beim Abmelden vergisst der Service Worker die gemerkten Seiten dieses Nutzers.
    <form action={signOutAction} onSubmit={() => tellServiceWorker({ type: "clear-pages" })}>
      <Button type="submit" variant="outline" className="w-full justify-start" size="lg">
        <LogOutIcon aria-hidden />
        {t("signOut")}
      </Button>
    </form>
  );
}
