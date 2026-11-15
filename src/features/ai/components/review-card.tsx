"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { CircleAlertIcon, CircleCheckIcon, EyeIcon, Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MAX_REVIEW_QUESTION_LENGTH, type AiReview, type ReviewStatus } from "@/domain/ai/review";
import type { ActionResult } from "@/lib/action-result";
import { createReviewAction, deleteReviewAction } from "../actions";

interface ReviewCardProps {
  /** Der Nutzer hat den KI-Funktionen zugestimmt. */
  enabled: boolean;
  latest: { question: string | null; review: AiReview; createdLabel: string } | null;
}

const STATUS_ICONS: Record<ReviewStatus, typeof CircleCheckIcon> = {
  good: CircleCheckIcon,
  watch: EyeIcon,
  act: CircleAlertIcon,
};

/** KI-Auswertung aller Daten: optional mit Frage starten, Ergebnis ansehen und löschen. */
export function ReviewCard({ enabled, latest }: ReviewCardProps) {
  const t = useTranslations("ai.review");
  const tErrors = useTranslations("errors");
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [pending, startTransition] = useTransition();

  function run<T>(action: () => Promise<ActionResult<T>>, success: string) {
    startTransition(async () => {
      const result = await action().catch(() => null);
      if (!result?.ok) {
        toast.error(tErrors(result?.error ?? "AI_FAILED"));
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  function create() {
    run(() => createReviewAction(question), t("created"));
    setQuestion("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="text-muted-foreground size-5" aria-hidden />
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-muted-foreground text-sm">{t("description")}</p>
        {!enabled ? (
          <div className="grid gap-3">
            <p className="text-sm">{t("needsConsent")}</p>
            <Button asChild variant="outline" className="justify-self-start">
              <Link href="/settings">{t("toSettings")}</Link>
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="review-question">{t("question")}</Label>
              <textarea
                id="review-question"
                rows={3}
                maxLength={MAX_REVIEW_QUESTION_LENGTH}
                placeholder={t("placeholder")}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                className="border-input bg-background w-full rounded-md border px-3 py-2 text-base"
              />
            </div>
            {pending ? (
              <p role="status" className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2Icon className="size-4 animate-spin" aria-hidden />
                {t("loading")}
              </p>
            ) : null}
            <Button onClick={create} disabled={pending}>
              {latest ? t("again") : t("start")}
            </Button>
          </div>
        )}

        {latest ? (
          <section aria-label={t("resultLabel")} className="grid gap-4 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-sm">{t("createdAt", { date: latest.createdLabel })}</p>
              <Button
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label={t("delete")}
                disabled={pending}
                onClick={() => run(() => deleteReviewAction(), t("deleted"))}
              >
                <Trash2Icon aria-hidden />
              </Button>
            </div>
            {latest.question ? (
              <div className="grid gap-1">
                <p className="text-sm font-medium">{t("yourQuestion")}</p>
                <p className="text-muted-foreground text-sm">{latest.question}</p>
                {latest.review.answer ? <p className="text-sm">{latest.review.answer}</p> : null}
              </div>
            ) : null}
            {latest.review.summary ? <p className="text-sm">{latest.review.summary}</p> : null}
            {latest.review.areas.length > 0 ? (
              <ul className="grid gap-3">
                {latest.review.areas.map((item) => {
                  const Icon = STATUS_ICONS[item.status];
                  return (
                    <li key={item.area} className="grid gap-1 rounded-xl border p-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Icon className="size-4 shrink-0" aria-hidden />
                        {t(`areas.${item.area}`)}
                        <span className="text-muted-foreground font-normal">· {t(`statuses.${item.status}`)}</span>
                      </p>
                      <p className="text-sm">{item.text}</p>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            {latest.review.recommendations.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">{t("recommendations")}</p>
                <ol className="grid list-decimal gap-2 pl-5 text-sm">
                  {latest.review.recommendations.map((item, index) => (
                    <li key={index}>
                      <span className="text-muted-foreground">{t(`areas.${item.area}`)}: </span>
                      {item.text}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            {latest.review.dataGaps.length > 0 ? (
              <div className="grid gap-2">
                <p className="text-sm font-medium">{t("dataGaps")}</p>
                <ul className="text-muted-foreground grid list-disc gap-1 pl-5 text-sm">
                  {latest.review.dataGaps.map((gap, index) => (
                    <li key={index}>{gap}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-muted-foreground text-xs">{t("disclaimer")}</p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
