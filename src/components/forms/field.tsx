import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface FieldProps extends ComponentProps<typeof Input> {
  id: string;
  label: string;
  hint?: string;
}

export function Field({ id, label, hint, ...inputProps }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-describedby={hintId} {...inputProps} />
      {hint ? (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
