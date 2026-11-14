import type { ReactNode } from "react";

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6 space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
  );
}
