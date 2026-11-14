import { getCurrentUser } from "@/features/auth/session";
import { exportOwnData } from "@/features/users/services/account-service";
import { getDb } from "@/lib/server/context";

export async function GET(): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const data = await exportOwnData(getDb(), user.id);
  const date = new Date().toISOString().slice(0, 10);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="clickfit-export-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
