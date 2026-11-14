"use client";

import { useTranslations } from "next-intl";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ErrorCode } from "@/lib/errors";

export function FormError({ code }: { code: ErrorCode | null | undefined }) {
  const t = useTranslations("errors");
  if (!code) return null;
  return (
    <Alert variant="destructive" role="alert">
      <AlertCircleIcon aria-hidden />
      <AlertDescription>{t(code)}</AlertDescription>
    </Alert>
  );
}
