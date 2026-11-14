"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ActionState } from "@/lib/errors";

/** Zeigt pro erfolgreichem Ergebnis einer Server Action genau einen Erfolgs-Toast. */
export function useActionToast(state: ActionState, message: string, onSuccess?: () => void): void {
  const handled = useRef<ActionState | null>(null);
  useEffect(() => {
    if (state.status !== "success" || handled.current === state) return;
    handled.current = state;
    toast.success(message);
    onSuccess?.();
  }, [state, message, onSuccess]);
}
