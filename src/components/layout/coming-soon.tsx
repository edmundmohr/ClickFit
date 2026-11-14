import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Illustration, type IllustrationName } from "@/components/illustration";

/** Platzhalter für Bereiche, die in einer späteren Phase kommen. */
export async function ComingSoon({
  title,
  description,
  phase,
  illustration,
}: {
  title: string;
  description: string;
  phase: number;
  illustration?: IllustrationName;
}) {
  const t = await getTranslations("common");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <Badge variant="secondary">{t("comingSoon", { phase })}</Badge>
      </CardHeader>
      <CardContent className="text-muted-foreground grid gap-4 text-sm">
        {illustration ? <Illustration name={illustration} /> : null}
        {description}
      </CardContent>
    </Card>
  );
}
