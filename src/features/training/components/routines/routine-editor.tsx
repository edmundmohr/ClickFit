"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CopyIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Field } from "@/components/forms/field";
import { WEEKDAYS } from "@/domain/training/types";
import { groupKind, normalizeGroups } from "@/domain/training/supersets";
import { useActionRunner } from "@/hooks/use-action-runner";
import { deleteRoutineAction, duplicateRoutineAction, saveRoutineAction } from "../../flex-actions";
import type { RoutineInput } from "../../schemas";
import {
  groupSize,
  isLinkedToNext,
  linkWithNext,
  moveItem,
  newItem,
  unlinkFromNext,
  type EditorItem,
  type PickerExercise,
} from "./editor-state";
import { ExercisePicker } from "./exercise-picker";
import { RoutineItem } from "./routine-item";
import type { UnitSystem } from "@/lib/units";

interface RoutineEditorProps {
  routineId: string;
  /** Eigener Name; leer bei Tagen aus dem erzeugten Plan. */
  initialName: string;
  /** Anzeigename, falls kein eigener Name vergeben ist (z. B. „Oberkörper A“). */
  fallbackName: string;
  initialWeekday: number;
  initialFolderId: string;
  initialItems: EditorItem[];
  folders: { id: string; title: string }[];
  exercises: PickerExercise[];
  /** Einheit des Nutzers für die Eingabe des Zielgewichts (gespeichert wird in kg). */
  unitSystem: UnitSystem;
}

const selectClass = "border-input bg-background h-11 w-full min-w-0 rounded-md border px-3 text-base";
const NO_WEEKDAY = 0;
/** Erst nach ein paar Pixeln Bewegung gilt ein Tipp auf den Griff als Ziehen. */
const DRAG_START_DISTANCE = 6;

export function RoutineEditor({
  routineId,
  initialName,
  fallbackName,
  initialWeekday,
  initialFolderId,
  initialItems,
  folders,
  exercises,
  unitSystem,
}: RoutineEditorProps) {
  const t = useTranslations();
  const router = useRouter();
  const dndId = useId();
  const { run, pending } = useActionRunner();
  const [name, setName] = useState(initialName);
  const [weekday, setWeekday] = useState(initialWeekday);
  const [folderId, setFolderId] = useState(initialFolderId);
  const [items, setItems] = useState(initialItems);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  // Enthält die Routine gelöschte Übungen, ist das Entfernen eine offene Änderung.
  const [dirty, setDirty] = useState(() => initialItems.some((item) => item.archived));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_START_DISTANCE } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function change(next: EditorItem[]) {
    setItems(next);
    setDirty(true);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((item) => item.key === active.id);
    const to = items.findIndex((item) => item.key === over.id);
    change(moveItem(items, from, to));
  }

  function patch(key: string, values: Partial<EditorItem>) {
    change(items.map((item) => (item.key === key ? { ...item, ...values } : item)));
  }

  function toggleLink(index: number) {
    const groupId = crypto.randomUUID().slice(0, 8);
    change(isLinkedToNext(items, index) ? unlinkFromNext(items, index, groupId) : linkWithNext(items, index, groupId));
  }

  const archivedItems = items.filter((item) => item.archived);
  const activeItems = items.filter((item) => !item.archived);

  function save() {
    const invalid = activeItems.find((item) => item.repMin > item.repMax);
    if (invalid) {
      toast.error(t("routines.editor.invalidRange", { name: invalid.name }));
      setExpandedKey(invalid.key);
      return;
    }
    const input: RoutineInput = {
      name: name.trim(),
      weekday,
      folderId,
      // Gelöschte Übungen fallen beim Speichern heraus (siehe Hinweis über der Liste).
      exercises: activeItems.map(
        ({ exerciseId, sets, repMin, repMax, targetRir, restSeconds, groupId, targetWeightKg }) => ({
          exerciseId,
          sets,
          repMin,
          repMax,
          targetRir,
          restSeconds,
          groupId,
          targetWeightKg,
        }),
      ),
    };
    run(
      () => saveRoutineAction(routineId, input),
      () => {
        setItems(normalizeGroups(activeItems));
        setDirty(false);
        toast.success(t("routines.editor.saved"));
      },
    );
  }

  const usedIds = new Set(items.map((item) => item.exerciseId));
  const displayName = name.trim() || fallbackName;

  return (
    <div className="grid gap-4 pb-24">
      <Card>
        <CardContent className="grid gap-4">
          <Field
            id="routine-name"
            label={t("routines.editor.name")}
            placeholder={fallbackName}
            maxLength={40}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setDirty(true);
            }}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="routine-weekday">{t("routines.editor.weekday")}</Label>
              <select
                id="routine-weekday"
                value={weekday}
                onChange={(event) => {
                  setWeekday(Number(event.target.value));
                  setDirty(true);
                }}
                className={selectClass}
              >
                <option value={NO_WEEKDAY}>{t("routines.editor.noWeekday")}</option>
                {WEEKDAYS.map((day) => (
                  <option key={day} value={day}>
                    {t(`training.weekdays.${day}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="routine-folder">{t("routines.editor.folder")}</Label>
              <select
                id="routine-folder"
                value={folderId}
                onChange={(event) => {
                  setFolderId(event.target.value);
                  setDirty(true);
                }}
                className={selectClass}
              >
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-2">
        <h2 className="text-lg font-semibold">{t("routines.editor.exercises")}</h2>
        <p className="text-muted-foreground text-sm">{t("routines.editor.hint")}</p>
        {archivedItems.length > 0 ? (
          <Alert>
            <AlertDescription>
              {t("routines.editor.archivedNotice", {
                count: archivedItems.length,
                names: archivedItems.map((item) => item.name).join(", "),
              })}
            </AlertDescription>
          </Alert>
        ) : null}
        {items.length === 0 ? <p className="text-sm">{t("routines.editor.empty")}</p> : null}
        <DndContext id={dndId} sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={items.map((item) => item.key)} strategy={verticalListSortingStrategy}>
            <ul className="grid">
              {items.map((item, index) => {
                const size = groupSize(items, index);
                const kind = groupKind(size);
                const startsGroup = kind !== null && items[index - 1]?.groupId !== item.groupId;
                return (
                  <RoutineItem
                    key={item.key}
                    item={item}
                    unitSystem={unitSystem}
                    groupLabel={startsGroup && kind ? t(`routines.editor.${kind}`) : null}
                    expanded={expandedKey === item.key}
                    isFirst={index === 0}
                    isLast={index === items.length - 1}
                    linked={isLinkedToNext(items, index)}
                    grouped={kind !== null}
                    onToggleExpand={() => setExpandedKey((current) => (current === item.key ? null : item.key))}
                    onPatch={(values) => patch(item.key, values)}
                    onRemove={() => change(items.filter((entry) => entry.key !== item.key))}
                    onMove={(delta) => change(moveItem(items, index, index + delta))}
                    onToggleLink={() => toggleLink(index)}
                  />
                );
              })}
            </ul>
          </SortableContext>
        </DndContext>
        <ExercisePicker
          exercises={exercises}
          usedIds={usedIds}
          onPick={(exercise) => {
            change([...items, newItem(exercise, crypto.randomUUID())]);
            toast.success(exercise.name);
          }}
        />
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={pending || dirty}
          onClick={() =>
            run(
              () => duplicateRoutineAction(routineId, t("routines.editor.duplicateName", { name: displayName }).slice(0, 40)),
              (copyId) => {
                toast.success(t("routines.editor.duplicated"));
                router.push(`/training/routines/${copyId}`);
              },
            )
          }
        >
          <CopyIcon aria-hidden />
          {t("routines.editor.duplicate")}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="text-destructive" disabled={pending}>
              <Trash2Icon aria-hidden />
              {t("routines.editor.delete")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("routines.editor.deleteTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("routines.editor.deleteText")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  run(
                    () => deleteRoutineAction(routineId),
                    () => {
                      toast.success(t("routines.editor.deleted"));
                      router.push(`/training/plans/${initialFolderId}`);
                    },
                  )
                }
              >
                {t("common.delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="bg-background/95 fixed inset-x-0 bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-20 border-t px-4 py-2 backdrop-blur md:bottom-0 md:left-56">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="text-muted-foreground min-w-0 flex-1 truncate text-sm">
            {dirty ? t("routines.editor.unsaved") : displayName}
          </p>
          <Button size="lg" onClick={save} disabled={pending || !dirty}>
            {t("routines.editor.save")}
          </Button>
        </div>
      </div>
    </div>
  );
}
