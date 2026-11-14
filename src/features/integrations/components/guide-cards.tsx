import { getTranslations } from "next-intl/server";
import { HouseIcon, SmartphoneIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LIMITS } from "@/domain/health-import/types";
import { formatNumber } from "@/lib/format";
import { HTTP_METHOD, authHeaderLine, homeAssistantExample } from "../endpoint";
import { CopyButton } from "./copy-button";

const STEPS = ["token", "automation", "url", "header", "format", "metrics", "period", "workouts"] as const;
const NOTES = ["strength", "manual", "limit"] as const;

/** Adresse und Header der Import-Route zum Abschreiben oder Kopieren. */
async function EndpointDetails({ endpoint }: { endpoint: string }) {
  const t = await getTranslations("integrations.endpoint");
  return (
    <dl className="grid gap-3 rounded-lg border p-3 text-sm">
      <div className="grid gap-1">
        <dt className="text-muted-foreground text-xs">{t("url")}</dt>
        <dd className="font-mono break-all select-all">{endpoint}</dd>
      </div>
      <div className="grid gap-1">
        <dt className="text-muted-foreground text-xs">{t("method")}</dt>
        <dd className="font-mono">{HTTP_METHOD}</dd>
      </div>
      <div className="grid gap-1">
        <dt className="text-muted-foreground text-xs">{t("header")}</dt>
        <dd className="font-mono break-all">{authHeaderLine(t("tokenPlaceholder"))}</dd>
      </div>
      <CopyButton value={endpoint} label={t("copyUrl")} className="justify-self-start" />
    </dl>
  );
}

/** Anleitung für die iOS-App „Health Auto Export“. */
export async function HealthAutoExportCard({ endpoint }: { endpoint: string }) {
  const t = await getTranslations("integrations.healthAutoExport");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SmartphoneIcon className="text-muted-foreground size-5" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ol className="grid list-decimal gap-2 pl-5 text-sm">
          {STEPS.map((step) => (
            <li key={step}>{t(`steps.${step}`)}</li>
          ))}
        </ol>
        <EndpointDetails endpoint={endpoint} />
        <ul className="text-muted-foreground grid list-disc gap-1 pl-5 text-sm">
          {NOTES.map((note) => (
            <li key={note}>{t(`notes.${note}`, { count: formatNumber(LIMITS.maxEntriesPerKind, 0) })}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** Beispiel für Home Assistant: Gewicht einer smarten Waage über denselben Token schicken. */
export async function HomeAssistantCard({ endpoint }: { endpoint: string }) {
  const t = await getTranslations("integrations");
  const placeholder = t("endpoint.tokenPlaceholder");
  const example = homeAssistantExample(endpoint, placeholder);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HouseIcon className="text-muted-foreground size-5" aria-hidden />
          {t("homeAssistant.title")}
        </CardTitle>
        <CardDescription>{t("homeAssistant.description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <pre
          tabIndex={0}
          aria-label={t("homeAssistant.exampleLabel")}
          className="bg-muted max-w-full overflow-x-auto rounded-md p-3 text-xs leading-relaxed"
        >
          <code>{example}</code>
        </pre>
        <CopyButton value={example} label={t("homeAssistant.copy")} className="justify-self-start" />
        <ul className="text-muted-foreground grid list-disc gap-1 pl-5 text-sm">
          <li>{t("homeAssistant.secretsHint", { placeholder })}</li>
          <li>{t("homeAssistant.entityHint")}</li>
          <li>{t("homeAssistant.formatHint")}</li>
        </ul>
      </CardContent>
    </Card>
  );
}
