"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BanIcon, ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Chip } from "@/components/forms/choice";
import { MUSCLES, type Equipment, type Muscle } from "@/domain/exercises/types";

export interface LibraryExercise {
  id: string;
  name: string;
  primary: Muscle[];
  equipment: Equipment[];
  custom: boolean;
  excluded: boolean;
}

interface ExerciseLibraryProps {
  exercises: LibraryExercise[];
  /** Equipment des Nutzers; `null`, solange es noch kein Profil gibt. */
  ownEquipment: Equipment[] | null;
}

const ALL = "all";

export function ExerciseLibrary({ exercises, ownEquipment }: ExerciseLibraryProps) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  const [muscle, setMuscle] = useState<Muscle | typeof ALL>(ALL);
  const [onlyMine, setOnlyMine] = useState(false);
  const [onlyCustom, setOnlyCustom] = useState(false);
  const hasCustom = exercises.some((exercise) => exercise.custom);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return exercises.filter(
      (exercise) =>
        (needle === "" || exercise.name.toLowerCase().includes(needle)) &&
        (muscle === ALL || exercise.primary.includes(muscle)) &&
        (!onlyCustom || exercise.custom) &&
        (!onlyMine || !ownEquipment || exercise.equipment.every((item) => ownEquipment.includes(item))),
    );
  }, [exercises, query, muscle, onlyMine, onlyCustom, ownEquipment]);

  return (
    <div className="grid grid-cols-1 gap-4">
      <Input
        type="search"
        aria-label={t("training.library.search")}
        placeholder={t("training.library.search")}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="grid gap-2">
        <select
          aria-label={t("training.library.allMuscles")}
          value={muscle}
          onChange={(event) => {
            const value = event.target.value;
            setMuscle(MUSCLES.find((item) => item === value) ?? ALL);
          }}
          className="border-input bg-background h-11 w-full min-w-0 rounded-md border px-3 text-base"
        >
          <option value={ALL}>{t("training.library.allMuscles")}</option>
          {MUSCLES.map((item) => (
            <option key={item} value={item}>
              {t(`muscles.${item}`)}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          {ownEquipment ? (
            <Chip selected={onlyMine} onToggle={() => setOnlyMine((value) => !value)}>
              {t("training.library.onlyMine")}
            </Chip>
          ) : null}
          {hasCustom ? (
            <Chip selected={onlyCustom} onToggle={() => setOnlyCustom((value) => !value)}>
              {t("training.library.onlyCustom")}
            </Chip>
          ) : null}
        </div>
      </div>
      <p className="text-muted-foreground text-sm">{t("training.library.count", { count: filtered.length })}</p>
      {filtered.length === 0 ? <p className="text-sm">{t("training.library.empty")}</p> : null}
      <ul className="divide-y rounded-xl border">
        {filtered.map((exercise) => (
          <li key={exercise.id}>
            <Link
              href={`/training/exercises/${exercise.id}`}
              className="hover:bg-accent/60 flex min-h-14 items-center gap-2 px-4 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{exercise.name}</span>
                <span className="text-muted-foreground block truncate text-sm">
                  {exercise.primary.map((item) => t(`muscles.${item}`)).join(", ")}
                  {" · "}
                  {exercise.equipment.length > 0
                    ? exercise.equipment.map((item) => t(`equipment.${item}`)).join(", ")
                    : t("equipment.none")}
                </span>
              </span>
              {exercise.custom ? <Badge variant="secondary">{t("training.library.custom")}</Badge> : null}
              {exercise.excluded ? (
                <BanIcon className="text-muted-foreground size-4 shrink-0" aria-label={t("training.library.exclude")} />
              ) : null}
              <ChevronRightIcon className="text-muted-foreground size-4 shrink-0" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
