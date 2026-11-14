"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { DownloadIcon } from "lucide-react";
import { Chip, ChoiceCard, FieldGroup } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { addDays, isValidLocalDate, type LocalDate } from "@/lib/dates";
import {
  EXPORT_DATASETS,
  EXPORT_FORMATS,
  EXPORT_TABLES,
  exportUrl,
  isTableOf,
  type ExportDataset,
  type ExportFormat,
  type ExportRange,
  type ExportTableKey,
} from "../datasets";

const PERIODS = ["days30", "days90", "year", "all", "custom"] as const;
type Period = (typeof PERIODS)[number];

/** Zeitraum zur Auswahl, beide Tage eingeschlossen; `null`, wenn die eigenen Angaben nicht passen. */
function rangeOf(period: Period, today: LocalDate, from: string, to: string): ExportRange | null {
  switch (period) {
    case "days30":
      return { from: addDays(today, -29), to: today };
    case "days90":
      return { from: addDays(today, -89), to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "all":
      return { from: null, to: today };
    case "custom":
      return isValidLocalDate(from) && isValidLocalDate(to) && from <= to ? { from, to } : null;
  }
}

/**
 * Auswahl für den Datenexport. Der Knopf ist ein gewöhnlicher Download-Link auf die Route:
 * Der Browser lädt die Datei selbst, es braucht weder `fetch` noch Zwischenspeicher.
 */
export function ExportForm({ today }: { today: LocalDate }) {
  const t = useTranslations("export");
  const formatter = useFormatter();
  const [dataset, setDataset] = useState<ExportDataset>("training");
  const [period, setPeriod] = useState<Period>("days30");
  const [from, setFrom] = useState<string>(addDays(today, -29));
  const [to, setTo] = useState<string>(today);
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [selectedTable, setSelectedTable] = useState<ExportTableKey>(EXPORT_TABLES.training[0]);

  const tables: readonly ExportTableKey[] = EXPORT_TABLES[dataset];
  // Eine CSV-Datei enthält genau eine Tabelle; Excel und PDF enthalten alle.
  const table = isTableOf(dataset, selectedTable) ? selectedTable : tables[0];
  const included = format === "csv" ? [table] : tables;
  const range = rangeOf(period, today, from, to);
  const href = range ? exportUrl({ dataset, format, range, table: format === "csv" ? table : undefined }) : null;

  return (
    <div className="grid gap-6">
      <FieldGroup label={t("form.dataset")}>
        <div role="radiogroup" aria-label={t("form.dataset")} className="grid gap-2">
          {EXPORT_DATASETS.map((item) => (
            <ChoiceCard
              key={item}
              selected={dataset === item}
              onSelect={() => setDataset(item)}
              title={t(`datasets.${item}`)}
              hint={t(`datasetHints.${item}`)}
            />
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label={t("form.period")}>
        <div role="radiogroup" aria-label={t("form.period")} className="flex flex-wrap gap-2">
          {PERIODS.map((item) => (
            <Chip key={item} role="radio" selected={period === item} onToggle={() => setPeriod(item)}>
              {t(`form.periods.${item}`)}
            </Chip>
          ))}
        </div>
        {period === "custom" ? (
          <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              id="export-from"
              label={t("form.from")}
              type="date"
              max={to || today}
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <Field
              id="export-to"
              label={t("form.to")}
              type="date"
              min={from || undefined}
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </div>
        ) : null}
        {range === null ? (
          <p role="alert" className="text-destructive text-sm">
            {t("form.invalidRange")}
          </p>
        ) : null}
      </FieldGroup>

      <FieldGroup label={t("form.format")} hint={t(`form.formatHints.${format}`)}>
        <div role="radiogroup" aria-label={t("form.format")} className="flex flex-wrap gap-2">
          {EXPORT_FORMATS.map((item) => (
            <Chip key={item} role="radio" selected={format === item} onToggle={() => setFormat(item)}>
              {t(`form.formats.${item}`)}
            </Chip>
          ))}
        </div>
      </FieldGroup>

      {format === "csv" && tables.length > 1 ? (
        <FieldGroup label={t("form.table")} hint={t("form.tableHint")}>
          <div role="radiogroup" aria-label={t("form.table")} className="flex flex-wrap gap-2">
            {tables.map((item) => (
              <Chip key={item} role="radio" selected={table === item} onToggle={() => setSelectedTable(item)}>
                {t(`tables.${item}`)}
              </Chip>
            ))}
          </div>
        </FieldGroup>
      ) : null}

      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {t("form.contains", {
            tables: formatter.list(
              included.map((item) => t(`tables.${item}`)),
              { type: "conjunction" },
            ),
          })}
        </p>
        {href ? (
          <Button asChild size="lg" className="w-full">
            <a href={href} download>
              <DownloadIcon aria-hidden />
              {t("form.download")}
            </a>
          </Button>
        ) : (
          <Button type="button" size="lg" className="w-full" disabled>
            <DownloadIcon aria-hidden />
            {t("form.download")}
          </Button>
        )}
      </div>
    </div>
  );
}
