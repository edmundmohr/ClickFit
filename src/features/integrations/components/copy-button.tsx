"use client";

import type { ComponentProps } from "react";
import { useTranslations } from "next-intl";
import { CopyIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface CopyButtonProps {
  /** Text, der in die Zwischenablage kommt. */
  value: string;
  label: string;
  variant?: ComponentProps<typeof Button>["variant"];
  className?: string;
}

/** Kopiert einen Text in die Zwischenablage und bestätigt das mit einer Meldung. */
export function CopyButton({ value, label, variant = "outline", className }: CopyButtonProps) {
  const t = useTranslations("integrations.copy");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("done"));
    } catch {
      // Ohne sichere Verbindung oder Erlaubnis gibt es keine Zwischenablage.
      toast.error(t("failed"));
    }
  }

  return (
    <Button type="button" variant={variant} className={className} onClick={copy}>
      <CopyIcon aria-hidden />
      {label}
    </Button>
  );
}
