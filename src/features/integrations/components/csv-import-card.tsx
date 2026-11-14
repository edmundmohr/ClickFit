"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { FileUpIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Chip, FieldGroup } from "@/components/forms/choice";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { CSV_KINDS, LIMITS, type CsvKind } from "@/domain/health-import/types";
import { useActionRunner } from "@/hooks/use-action-runner";
import { formatNumber } from "@/lib/format";
import { importCsvAction, type CsvImportResult } from "../actions";
import { CSV_MAX_FILE_BYTES, CSV_MAX_REQUEST_BYTES, csvRequestBytes } from "../constants";

interface SelectedFile {
  name: string;
  size: number;
  text: string;
}

const COUNT_KEYS = ["weight", "steps", "restingHeartRate", "workouts"] as const;
const toKilobytes = (bytes: number) => formatNumber(Math.max(1, Math.round(bytes / 1000)), 0);

/** CSV-Import: Art wählen, Datei wählen oder Text einfügen, danach Zähler und Zeilenfehler. */
export function CsvImportCard() {
  const t = useTranslations("integrations.csv");
  const { run, pending } = useActionRunner();
  const fileInput = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<CsvKind>("weight");
  const [file, setFile] = useState<SelectedFile | null>(null);
  const [fileError, setFileError] = useState<"fileTooLarge" | "fileUnreadable" | null>(null);
  const [pasted, setPasted] = useState("");
  const [result, setResult] = useState<CsvImportResult | null>(null);
  const text = file?.text ?? pasted;
  // Eingefügter Text: Die Grenze gilt für die Größe, mit der er übertragen wird.
  const pastedTooLarge = file === null && csvRequestBytes(pasted) > CSV_MAX_REQUEST_BYTES;

  function clearFile() {
    setFile(null);
    setFileError(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0];
    setResult(null);
    if (!selected) return clearFile();
    if (selected.size > CSV_MAX_FILE_BYTES) {
      clearFile();
      return setFileError("fileTooLarge");
    }
    try {
      // Die Datei bleibt im Browser, bis „Importieren“ gedrückt wird.
      const content = await selected.text();
      // Maskierte Zeilenumbrüche und Anführungszeichen machen den Text beim Senden größer.
      if (csvRequestBytes(content) > CSV_MAX_REQUEST_BYTES) {
        clearFile();
        return setFileError("fileTooLarge");
      }
      setFile({ name: selected.name, size: selected.size, text: content });
      setFileError(null);
    } catch {
      clearFile();
      setFileError("fileUnreadable");
    }
  }

  function submit() {
    setResult(null);
    if (csvRequestBytes(text) > CSV_MAX_REQUEST_BYTES) return;
    run(
      () => importCsvAction(kind, text),
      (data) => {
        setResult(data);
        if (data.fatal === null) {
          toast.success(t("result.done"));
          clearFile();
          setPasted("");
        }
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileUpIcon className="text-muted-foreground size-5" aria-hidden />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <FieldGroup label={t("kind")} hint={t(`columns.${kind}`)}>
          <div role="radiogroup" aria-label={t("kind")} className="flex flex-wrap gap-2">
            {CSV_KINDS.map((item) => (
              <Chip
                key={item}
                role="radio"
                selected={kind === item}
                onToggle={() => {
                  setKind(item);
                  setResult(null);
                }}
              >
                {t(`kinds.${item}`)}
              </Chip>
            ))}
          </div>
        </FieldGroup>

        <div className="grid gap-2">
          <Field
            ref={fileInput}
            id="csv-file"
            label={t("file")}
            type="file"
            accept=".csv,text/csv"
            hint={t("formatHint")}
            onChange={selectFile}
          />
          {file ? (
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-sm break-all">{t("fileSelected", { name: file.name, size: toKilobytes(file.size) })}</p>
              <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={t("removeFile")} onClick={clearFile}>
                <XIcon aria-hidden />
              </Button>
            </div>
          ) : null}
          {fileError ? (
            <p role="alert" className="text-destructive text-sm">
              {t(fileError, { size: toKilobytes(CSV_MAX_FILE_BYTES) })}
            </p>
          ) : null}
        </div>

        {file ? null : (
          <div className="grid gap-2">
            <Label htmlFor="csv-text">{t("paste")}</Label>
            <textarea
              id="csv-text"
              rows={5}
              maxLength={CSV_MAX_FILE_BYTES}
              placeholder={t("pastePlaceholder")}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              value={pasted}
              onChange={(event) => {
                setPasted(event.target.value);
                setResult(null);
              }}
              className="border-input bg-background w-full rounded-md border px-3 py-2 font-mono text-base"
            />
            {pastedTooLarge ? (
              <p role="alert" className="text-destructive text-sm">
                {t("textTooLarge")}
              </p>
            ) : null}
          </div>
        )}

        <Button type="button" size="lg" className="w-full" disabled={pending || text.trim() === "" || pastedTooLarge} onClick={submit}>
          {pending ? t("submitting") : t("submit")}
        </Button>

        {result ? <CsvResult result={result} /> : null}
      </CardContent>
    </Card>
  );
}

function CsvResult({ result }: { result: CsvImportResult }) {
  const t = useTranslations("integrations.csv");
  if (result.fatal !== null) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {t(`fatal.${result.fatal}`, { max: LIMITS.maxEntriesPerKind })}
      </p>
    );
  }
  const hidden = result.errorCount - result.errors.length;
  return (
    <div role="status" className="grid gap-3 rounded-lg border p-3">
      <p className="text-sm font-medium">{t("result.title")}</p>
      <ul className="grid gap-1 text-sm">
        <li>{t("result.rows", { count: result.rows })}</li>
        {COUNT_KEYS.filter((key) => result.imported[key] > 0).map((key) => (
          <li key={key}>{t(`result.${key}`, { count: result.imported[key] })}</li>
        ))}
        {result.skipped > 0 ? <li>{t("result.skipped", { count: result.skipped })}</li> : null}
      </ul>
      {result.errors.length > 0 ? (
        <div className="grid gap-1">
          <p className="text-sm font-medium">{t("result.errorsTitle")}</p>
          <ul className="text-muted-foreground grid gap-1 text-sm">
            {result.errors.map((error) => (
              <li key={error.line}>{t("result.error", { line: error.line, reason: t(`issues.${error.issue}`) })}</li>
            ))}
            {hidden > 0 ? <li>{t("result.moreErrors", { count: hidden })}</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
