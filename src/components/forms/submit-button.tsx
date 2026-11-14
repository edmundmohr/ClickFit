"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  children,
  pendingLabel,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={className}>
      {pending ? (
        <>
          <Loader2Icon className="animate-spin" aria-hidden />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
