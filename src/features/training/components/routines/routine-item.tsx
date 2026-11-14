"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslations } from "next-intl";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  GripVerticalIcon,
  Link2Icon,
  MinusIcon,
  PlusIcon,
  Trash2Icon,
  UnlinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MAX_SETS, MIN_SETS, REST_OPTIONS, RIR_OPTIONS, type EditorItem } from "./editor-state";

interface RoutineItemProps {
  item: EditorItem;
  /** Überschrift „Supersatz“/„Zirkel“ über der ersten Übung einer Gruppe. */
  groupLabel: string | null;
  expanded: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** Mit der folgenden Übung verbunden (Supersatz/Zirkel). */
  linked: boolean;
  /** Gehört zu einer Gruppe: wird optisch eingerückt. */
  grouped: boolean;
  onToggleExpand: () => void;
  onPatch: (patch: Partial<EditorItem>) => void;
  onRemove: () => void;
  onMove: (delta: number) => void;
  onToggleLink: () => void;
}

const inputClass = "border-input bg-background h-11 w-full min-w-0 rounded-md border px-2 text-center text-base tabular-nums";

function clampInt(value: string, min: number, max: number, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.round(parsed), min), max) : fallback;
}

export function RoutineItem({
  item,
  groupLabel,
  expanded,
  isFirst,
  isLast,
  linked,
  grouped,
  onToggleExpand,
  onPatch,
  onRemove,
  onMove,
  onToggleLink,
}: RoutineItemProps) {
  const t = useTranslations("routines.editor");
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });
  const isTimed = item.type === "duration";
  const maxValue = isTimed ? 600 : 100;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      {groupLabel ? (
        <p className="text-primary pb-1 text-xs font-semibold tracking-wide uppercase">{groupLabel}</p>
      ) : null}
      <div
        className={cn(
          "bg-card rounded-xl border",
          grouped && "border-l-primary border-l-4",
          isDragging && "shadow-lg",
        )}
      >
        <div className="flex items-center gap-1 p-1">
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t("drag", { name: item.name })}
            className="text-muted-foreground flex size-11 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
          >
            <GripVerticalIcon className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={t("expand", { name: item.name })}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.name}</span>
              {item.archived ? <span className="text-destructive block text-sm">{t("archived")}</span> : null}
              <span className="text-muted-foreground block truncate text-sm tabular-nums">
                {t(isTimed ? "summarySeconds" : "summary", { sets: item.sets, min: item.repMin, max: item.repMax })}
                {" · "}
                {t("summaryRest", { time: formatClock(item.restSeconds) })}
              </span>
            </span>
            <ChevronDownIcon
              className={cn("text-muted-foreground size-4 shrink-0 transition-transform", expanded && "rotate-180")}
              aria-hidden
            />
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-11 shrink-0"
            aria-label={t("remove", { name: item.name })}
            onClick={onRemove}
          >
            <Trash2Icon aria-hidden />
          </Button>
        </div>

        {expanded ? (
          <div className="grid gap-3 border-t p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t("sets")}</Label>
                <div className="grid grid-cols-[2.75rem_1fr_2.75rem] items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label={t("fewerSets")}
                    disabled={item.sets <= MIN_SETS}
                    onClick={() => onPatch({ sets: item.sets - 1 })}
                  >
                    <MinusIcon aria-hidden />
                  </Button>
                  <span className="text-center text-lg font-semibold tabular-nums">{item.sets}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label={t("moreSets")}
                    disabled={item.sets >= MAX_SETS}
                    onClick={() => onPatch({ sets: item.sets + 1 })}
                  >
                    <PlusIcon aria-hidden />
                  </Button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`rest-${item.key}`}>{t("rest")}</Label>
                <select
                  id={`rest-${item.key}`}
                  value={item.restSeconds}
                  onChange={(event) => onPatch({ restSeconds: Number(event.target.value) })}
                  className={inputClass}
                >
                  {[...new Set([...REST_OPTIONS, item.restSeconds])]
                    .sort((a, b) => a - b)
                    .map((seconds) => (
                      <option key={seconds} value={seconds}>
                        {formatClock(seconds)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor={`min-${item.key}`}>{t(isTimed ? "secMin" : "repMin")}</Label>
                <input
                  id={`min-${item.key}`}
                  inputMode="numeric"
                  value={item.repMin}
                  onChange={(event) => onPatch({ repMin: clampInt(event.target.value, 1, maxValue, item.repMin) })}
                  onFocus={(event) => event.target.select()}
                  className={inputClass}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`max-${item.key}`}>{t(isTimed ? "secMax" : "repMax")}</Label>
                <input
                  id={`max-${item.key}`}
                  inputMode="numeric"
                  value={item.repMax}
                  onChange={(event) => onPatch({ repMax: clampInt(event.target.value, 1, maxValue, item.repMax) })}
                  onFocus={(event) => event.target.select()}
                  className={inputClass}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`rir-${item.key}`}>{t("rir")}</Label>
                <select
                  id={`rir-${item.key}`}
                  value={item.targetRir}
                  onChange={(event) => onPatch({ targetRir: Number(event.target.value) })}
                  className={inputClass}
                >
                  {RIR_OPTIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={isFirst} onClick={() => onMove(-1)}>
                <ArrowUpIcon aria-hidden />
                {t("moveUp")}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={isLast} onClick={() => onMove(1)}>
                <ArrowDownIcon aria-hidden />
                {t("moveDown")}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {isLast ? null : (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={onToggleLink}
            aria-pressed={linked}
            aria-label={t(linked ? "unlink" : "link")}
            className={cn(
              "flex h-11 w-14 items-center justify-center",
              linked ? "text-primary" : "text-muted-foreground/60",
            )}
          >
            {linked ? <Link2Icon className="size-5" aria-hidden /> : <UnlinkIcon className="size-4" aria-hidden />}
          </button>
        </div>
      )}
    </li>
  );
}
