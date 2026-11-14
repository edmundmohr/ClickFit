"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { IDLE_STATE, type ActionState } from "@/lib/errors";
import { startWorkoutFormAction } from "../actions";

interface StartWorkoutFormProps {
  planDayId: string;
  /** Kurzvariante (Zeitsparmodus). */
  short?: boolean;
  className?: string;
  /** Der Absende-Knopf. */
  children: ReactNode;
}

/**
 * Formular zum Starten eines Trainings. Klappt der Start nicht (z. B. enthält die Routine nur
 * gelöschte Übungen), erscheint eine verständliche Meldung statt der Fehlerseite.
 */
export function StartWorkoutForm({ planDayId, short = false, className, children }: StartWorkoutFormProps) {
  const t = useTranslations();
  const [state, formAction] = useActionState(startWorkoutFormAction, IDLE_STATE);
  const handled = useRef<ActionState | null>(null);

  useEffect(() => {
    if (state.status !== "error" || handled.current === state) return;
    handled.current = state;
    toast.error(state.error === "PLAN_EMPTY" ? t("routines.startEmpty") : t(`errors.${state.error}`));
  }, [state, t]);

  return (
    <form action={formAction} className={className}>
      <input type="hidden" name="planDayId" value={planDayId} />
      {short ? <input type="hidden" name="short" value="1" /> : null}
      {children}
    </form>
  );
}
