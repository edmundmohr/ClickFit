"use server";

import { revalidatePath } from "next/cache";
import { parseCsv, type CsvFatal, type CsvRowError } from "@/domain/health-import/csv";
import { requireUser } from "@/features/auth/session";
import { attempt, invalid, type ActionResult } from "@/lib/action-result";
import { getDb } from "@/lib/server/context";
import { csvImportSchema, tokenIdSchema, tokenNameSchema } from "./schemas";
import { applyHealthImport, type ImportCounts } from "./services/import-service";
import { createToken, deleteToken } from "./services/token-service";

/**
 * Server Actions der Integrationen: API-Token verwalten und CSV-Dateien importieren.
 */

const refresh = () => revalidatePath("/", "layout");

/** Legt einen Token an und gibt ihn im Klartext zurück – das einzige Mal, dass er sichtbar ist. */
export async function createTokenAction(name: string): Promise<ActionResult<{ token: string }>> {
  const user = await requireUser();
  const parsed = tokenNameSchema.safeParse(name);
  if (!parsed.success) return invalid;
  const result = await attempt(async () => {
    const created = await createToken(getDb(), user.id, parsed.data);
    return { token: created.token };
  });
  refresh();
  return result;
}

export async function deleteTokenAction(tokenId: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!tokenIdSchema.safeParse(tokenId).success) return invalid;
  const result = await attempt(() => deleteToken(getDb(), user.id, tokenId));
  refresh();
  return result;
}

export interface CsvImportResult {
  /** Die Datei als Ganzes war unbrauchbar; dann wurde nichts importiert. */
  fatal: CsvFatal | null;
  /** Datenzeilen der Datei. */
  rows: number;
  imported: ImportCounts;
  skipped: number;
  /** Höchstens 20 Zeilenfehler; `errorCount` nennt alle. */
  errors: CsvRowError[];
  errorCount: number;
}

/** Liest eine CSV-Datei der gewählten Art ein und meldet Zähler und Zeilenfehler. */
export async function importCsvAction(kind: string, text: string): Promise<ActionResult<CsvImportResult>> {
  const user = await requireUser();
  const parsed = csvImportSchema.safeParse({ kind, text });
  if (!parsed.success) return invalid;
  const result = await attempt(async (): Promise<CsvImportResult> => {
    const now = new Date();
    const csv = parseCsv(parsed.data.text, parsed.data.kind, now);
    const { rows, errors, errorCount, fatal } = csv;
    if (fatal !== null) {
      return { fatal, rows, imported: { weight: 0, steps: 0, restingHeartRate: 0, workouts: 0 }, skipped: 0, errors, errorCount };
    }
    const applied = await applyHealthImport(getDb(), user.id, csv.data, "csv", now);
    return { fatal, rows, errors, errorCount, ...applied };
  });
  refresh();
  return result;
}
