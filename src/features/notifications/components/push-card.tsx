"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { BellIcon, BellOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { disablePush, enablePush, getPushState, sendTestPush, type PushState } from "../push-client";

/** Ein- und Ausschalten der Pausen-Benachrichtigung auf diesem Gerät. */
export function PushCard({ publicKey }: { publicKey: string }) {
  const t = useTranslations("settings.push");
  const [state, setState] = useState<PushState | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    void getPushState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function enable() {
    startTransition(async () => {
      const next = await enablePush(publicKey).catch((): PushState => "inactive");
      setState(next);
      if (next === "enabled") toast.success(t("enabledToast"));
      else if (next === "inactive") toast.error(t("failed"));
    });
  }

  function disable() {
    startTransition(async () => {
      setState(await disablePush());
      toast.success(t("disabledToast"));
    });
  }

  function test() {
    startTransition(async () => {
      if (await sendTestPush()) toast.success(t("testSent"));
      else toast.error(t("testFailed"));
    });
  }

  if (state === null) return <p className="text-muted-foreground text-sm">{t("checking")}</p>;
  return (
    <div className="grid gap-3">
      <p className="text-sm">{t(`states.${state}`)}</p>
      {state === "inactive" ? (
        <Button onClick={enable} disabled={pending} className="justify-self-start">
          <BellIcon aria-hidden />
          {t("enable")}
        </Button>
      ) : null}
      {state === "enabled" ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={test} disabled={pending}>
            <BellIcon aria-hidden />
            {t("test")}
          </Button>
          <Button variant="ghost" onClick={disable} disabled={pending}>
            <BellOffIcon aria-hidden />
            {t("disable")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
