import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createDb, type AppDatabase } from "@/db/client";

/** Cloudflare-Bindings und Secrets für den aktuellen Request. */
export function getEnv(): CloudflareEnv {
  return getCloudflareContext().env;
}

export function getDb(): AppDatabase {
  return createDb(getEnv().DB);
}
