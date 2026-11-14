"use client";

import { useTranslations } from "next-intl";
import { SparklesIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { setAiConsentAction } from "../actions";
import type { AiStatus } from "../services/ai-service";

/** Zustimmung zu den KI-Funktionen: erklärt, was gesendet wird, und schaltet sie pro Konto. */
export function AiConsentCard({ status }: { status: AiStatus }) {
  const t = useTranslations("ai.settings");
  const { run, pending } = useActionRunner();

  return (
    <div className="grid gap-3">
      {status.provider ? <p className="text-sm">{t("provider", { name: status.provider })}</p> : null}
      <div className="grid gap-1 text-sm">
        <p className="font-medium">{t("whatTitle")}</p>
        <ul className="text-muted-foreground list-disc space-y-1 pl-5">
          <li>{t("sendPlan")}</li>
          <li>{t("sendPhoto")}</li>
          <li>{t("never")}</li>
        </ul>
      </div>
      <p className="text-sm font-medium">{t(status.enabled ? "stateOn" : "stateOff")}</p>
      {status.enabled ? (
        <>
          <p className="text-muted-foreground text-sm">
            {t("usage", { used: Math.min(status.usedToday, status.dailyLimit), limit: status.dailyLimit })}
          </p>
          <Button
            variant="ghost"
            className="justify-self-start"
            disabled={pending}
            onClick={() => run(() => setAiConsentAction(false), () => toast.success(t("disabledToast")))}
          >
            {t("disable")}
          </Button>
        </>
      ) : (
        <Button
          className="justify-self-start"
          disabled={pending}
          onClick={() => run(() => setAiConsentAction(true), () => toast.success(t("enabledToast")))}
        >
          <SparklesIcon aria-hidden />
          {t("enable")}
        </Button>
      )}
    </div>
  );
}
