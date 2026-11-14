"use client";

import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import type { Theme } from "../services/account-service";

/** Übernimmt das im Profil gespeicherte Design einmalig nach der Anmeldung bzw. beim ersten Laden. */
export function ThemeSync({ theme }: { theme: Theme }) {
  const { setTheme } = useTheme();
  const applied = useRef<Theme | null>(null);

  useEffect(() => {
    if (applied.current === theme) return;
    applied.current = theme;
    setTheme(theme);
  }, [theme, setTheme]);

  return null;
}
