"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  const t = useTranslations("common");
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <Toaster position="top-center" richColors containerAriaLabel={t("notifications")} />
    </ThemeProvider>
  );
}
