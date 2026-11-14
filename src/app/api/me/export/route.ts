import { getCurrentUser } from "@/features/auth/session";
import { exportOwnData } from "@/features/users/services/account-service";
import { toLocalDate } from "@/lib/dates";
import { getDb } from "@/lib/server/context";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const data = await exportOwnData(getDb(), user.id);
  // Lokales Datum statt UTC, sonst trägt die Datei kurz nach Mitternacht das Datum von gestern.
  const date = toLocalDate(new Date());
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="clickfit-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
