"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/**
 * Führt eine Server Action aus, zeigt Fehler als Meldung und lädt danach die Seitendaten neu.
 */
export function useActionRunner() {
  const router = useRouter();
  const t = useTranslations("errors");
  const [pending, startTransition] = useTransition();

  const run = useCallback(
    <T,>(action: () => Promise<ActionResult<T>>, onSuccess?: (data: T) => void) => {
      startTransition(async () => {
        const result = await action().catch((): ActionResult<T> => ({ ok: false, error: "UNKNOWN" }));
        if (!result.ok) {
          toast.error(t(result.error));
          return;
        }
        onSuccess?.(result.data);
        router.refresh();
      });
    },
    [router, t],
  );

  return { run, pending };
}
