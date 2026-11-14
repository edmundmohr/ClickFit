"use client";

import { useActionState, useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormError } from "@/components/forms/form-error";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionToast } from "@/hooks/use-action-toast";
import { IDLE_STATE } from "@/lib/errors";
import { updatePreferencesAction } from "../actions";
import { THEMES, UNIT_SYSTEMS, type Theme, type UnitSystem } from "../services/account-service";

interface PreferencesFormProps {
  theme: Theme;
  unitSystem: UnitSystem;
}

function isTheme(value: string): value is Theme {
  return (THEMES as readonly string[]).includes(value);
}

export function PreferencesForm({ theme, unitSystem }: PreferencesFormProps) {
  const t = useTranslations();
  const { setTheme } = useTheme();
  const [selectedTheme, setSelectedTheme] = useState<Theme>(theme);
  const [state, formAction] = useActionState(updatePreferencesAction, IDLE_STATE);
  const applyTheme = useCallback(() => setTheme(selectedTheme), [setTheme, selectedTheme]);
  useActionToast(state, t("common.saved"), applyTheme);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="pref-theme">{t("settings.preferences.theme")}</Label>
        <Select
          name="theme"
          value={selectedTheme}
          onValueChange={(value) => {
            if (isTheme(value)) setSelectedTheme(value);
          }}
        >
          <SelectTrigger id="pref-theme" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`settings.preferences.themes.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="pref-units">{t("settings.preferences.units")}</Label>
        <Select name="unitSystem" defaultValue={unitSystem}>
          <SelectTrigger id="pref-units" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNIT_SYSTEMS.map((value) => (
              <SelectItem key={value} value={value}>
                {t(`settings.preferences.unitSystems.${value}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <FormError code={state.status === "error" ? state.error : null} />
      <SubmitButton pendingLabel={t("common.saving")} className="justify-self-start">
        {t("common.save")}
      </SubmitButton>
    </form>
  );
}
