import { z } from "zod";
import { renderCsv } from "@/domain/export/csv";
import { PDF_CONTENT_TYPE, renderPdf } from "@/domain/export/pdf";
import { XLSX_CONTENT_TYPE, renderXlsx } from "@/domain/export/xlsx";
import { getCurrentUser } from "@/features/auth/session";
import { EXPORT_FORMATS, EXPORT_TABLES, isExportDataset, isTableOf, type ExportFormat } from "@/features/export/datasets";
import { getExportFileName, getExportLabels, getPdfLabels } from "@/features/export/labels";
import { buildExportDocument } from "@/features/export/services/export-service";
import { isValidLocalDate, toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

const localDate = z.string().refine(isValidLocalDate);

const querySchema = z
  .object({
    format: z.enum(EXPORT_FORMATS),
    from: localDate.optional(),
    to: localDate.optional(),
    table: z.string().min(1).max(40).optional(),
  })
  .refine((query) => !query.from || !query.to || query.from <= query.to);

const CONTENT_TYPES: Record<ExportFormat, string> = {
  csv: "text/csv; charset=utf-8",
  xlsx: XLSX_CONTENT_TYPE,
  pdf: PDF_CONTENT_TYPE,
};

/** `Response` verlangt einen eigenen `ArrayBuffer`; die Erzeuger liefern teils nur einen Ausschnitt. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/**
 * Datenexport eines Datensatzes (`training`, `weight`, `nutrition`) als CSV, Excel oder PDF.
 * Parameter: `format` (Pflicht), `from` und `to` als lokales Datum (ohne `from`: alles bis `to`,
 * ohne `to`: bis heute) und `table` (nur diese eine Tabelle; bei CSV ohne Angabe die erste).
 */
export async function GET(request: Request, context: RouteContext<"/api/export/[dataset]">): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const { dataset } = await context.params;
  if (!isExportDataset(dataset)) return new Response(null, { status: 404 });

  const params = new URL(request.url).searchParams;
  const parsed = querySchema.safeParse({
    format: params.get("format") ?? undefined,
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    table: params.get("table") || undefined,
  });
  if (!parsed.success) return new Response(null, { status: 400 });
  const { format } = parsed.data;
  const requestedTable = parsed.data.table;
  if (requestedTable !== undefined && !isTableOf(dataset, requestedTable)) return new Response(null, { status: 400 });

  const from = parsed.data.from ?? null;
  const to = parsed.data.to ?? toLocalDate(new Date());
  if (from !== null && from > to) return new Response(null, { status: 400 });

  const labels = await getExportLabels(user.unitSystem);
  const full = await buildExportDocument(getDb(), { id: user.id, unitSystem: user.unitSystem }, dataset, { from, to }, labels);

  // Eine CSV-Datei enthält genau eine Tabelle; Excel und PDF alle, außer es ist eine gewünscht.
  const tableKey = requestedTable ?? (format === "csv" ? EXPORT_TABLES[dataset][0] : null);
  const tables = tableKey === null ? full.tables : full.tables.filter((table) => table.key === tableKey);
  const document = { ...full, tables };

  let body: Uint8Array;
  if (format === "csv") {
    const [table] = tables;
    if (!table) return new Response(null, { status: 400 });
    body = renderCsv(table);
  } else if (format === "xlsx") {
    body = renderXlsx(document);
  } else {
    body = await renderPdf(document, { labels: await getPdfLabels() });
  }

  const partial = tableKey !== null && EXPORT_TABLES[dataset].length > 1;
  const fileName = await getExportFileName({ dataset, table: partial ? tableKey : null, from, to });
  return new Response(toArrayBuffer(body), {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${fileName}.${format}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
