import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPlatformProxy } from "wrangler";
import { createDb, type AppDatabase } from "@/db/client";
import { account, rateLimit, session, user, verification } from "@/db/schema";

const MIGRATIONS_DIR = join("drizzle", "migrations");

export interface TestDatabase {
  db: AppDatabase;
  env: CloudflareEnv;
  reset: () => Promise<void>;
  dispose: () => Promise<void>;
}

/**
 * Startet eine echte lokale D1 (Miniflare, nur im Speicher) und spielt die Migrationen ein.
 * So laufen die Tests gegen dasselbe SQL-Verhalten wie in Produktion.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const proxy = await getPlatformProxy<CloudflareEnv>({
    configPath: "wrangler.jsonc",
    persist: false,
  });
  const d1 = proxy.env.DB;
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const statements = readFileSync(join(MIGRATIONS_DIR, file), "utf8")
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) await d1.prepare(statement).run();
  }
  const db = createDb(d1);
  return {
    db,
    env: proxy.env,
    reset: async () => {
      await db.delete(session);
      await db.delete(account);
      await db.delete(verification);
      await db.delete(rateLimit);
      await db.delete(user);
    },
    dispose: () => proxy.dispose(),
  };
}

/** Testpasswörter: nur für die Tests, keine echten Zugangsdaten. */
export const TEST_PASSWORDS = {
  admin: "test-admin-password",
  anna: "test-anna-password",
  eddi: "test-eddi-password",
  replacement: "another-test-password",
} as const;
