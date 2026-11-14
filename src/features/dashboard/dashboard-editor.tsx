"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowDownIcon, ArrowUpIcon, CheckIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useActionRunner } from "@/hooks/use-action-runner";
import { cn } from "@/lib/utils";
import { saveDashboardAction } from "@/features/progress/actions";
import type { WidgetSetting } from "@/features/progress/services/dashboard-service";

/** Reihenfolge und Sichtbarkeit der Kacheln auf der Heute-Seite. */
export function DashboardEditor({ initial }: { initial: WidgetSetting[] }) {
  const t = useTranslations("progress.dashboard");
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [widgets, setWidgets] = useState(initial);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= widgets.length) return;
    const next = [...widgets];
    [next[index], next[target]] = [next[target], next[index]];
    setWidgets(next);
  }

  function toggle(index: number) {
    setWidgets(widgets.map((widget, position) => (position === index ? { ...widget, visible: !widget.visible } : widget)));
  }

  return (
    <div className="grid gap-4">
      <ul className="grid gap-2">
        {widgets.map((widget, index) => {
          const name = t(`widgets.${widget.id}`);
          return (
            <li key={widget.id} className="flex items-center gap-2 rounded-xl border p-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={widget.visible}
                aria-label={t("show", { name })}
                onClick={() => toggle(index)}
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-md border",
                  widget.visible ? "border-primary bg-primary text-primary-foreground" : "border-input",
                )}
              >
                {widget.visible ? <CheckIcon className="size-5" aria-hidden /> : null}
              </button>
              <span className={cn("min-w-0 flex-1 truncate font-medium", !widget.visible && "text-muted-foreground")}>
                {name}
              </span>
              <Button variant="ghost" size="icon" aria-label={t("up", { name })} disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUpIcon aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("down", { name })}
                disabled={index === widgets.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDownIcon aria-hidden />
              </Button>
            </li>
          );
        })}
      </ul>
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          run(
            () => saveDashboardAction(widgets),
            () => {
              toast.success(t("saved"));
              router.push("/");
            },
          )
        }
      >
        {t("save")}
      </Button>
    </div>
  );
}
