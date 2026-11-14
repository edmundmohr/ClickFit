"use client";

import { useRouter } from "next/navigation";

interface ExerciseSelectProps {
  label: string;
  selected: string;
  options: { id: string; name: string }[];
}

/** Auswahl der Übung für die Kraftentwicklung; wechselt die Seite über den URL-Parameter. */
export function ExerciseSelect({ label, selected, options }: ExerciseSelectProps) {
  const router = useRouter();
  return (
    <select
      aria-label={label}
      value={selected}
      onChange={(event) => router.push(`/progress/strength?exercise=${event.target.value}`)}
      className="border-input bg-background h-11 w-full min-w-0 rounded-md border px-3 text-base"
    >
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}
