import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Platzhalter für Bereiche, die in einer späteren Phase kommen. */
export async function ComingSoon({
  title,
  description,
  phase,
}: {
  title: string;
  description: string;
  phase: number;
}) {
  const t = await getTranslations("common");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{title}</CardTitle>
        <Badge variant="secondary">{t("comingSoon", { phase })}</Badge>
      </CardHeader>
      <CardContent className="text-muted-foreground text-sm">{description}</CardContent>
    </Card>
  );
}
