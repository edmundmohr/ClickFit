/**
 * Legt die ersten Nutzerkonten in D1 an (weitere legt der Admin in der App an).
 *
 * Liest `seed-users.local.json` (von Git ignoriert, siehe `seed-users.example.json`), hasht die
 * Passwörter und spielt eine idempotente SQL-Datei mit `wrangler d1 execute` ein.
 * Bestehende Nutzer bleiben unberührt: Ein erneuter Lauf überschreibt nie geänderte Passwörter.
 *
 * Aufruf:
 *   npm run db:seed                       # lokale D1
 *   npm run db:seed -- --remote           # Produktions-D1
 *   npm run db:seed -- --remote --env staging
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { hashPassword, isPasswordLengthValid } from "../src/lib/auth/password";
import { normalizeUsername, placeholderEmail } from "../src/features/auth/services/user-factory";

const SEED_FILE = "seed-users.local.json";

const seedUsersSchema = z
  .array(
    z.object({
      username: z.string().trim().min(3).max(30),
      password: z.string(),
      role: z.enum(["admin", "user"]),
      name: z.string().trim().min(1).optional(),
    }),
  )
  .min(1);

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

async function buildSql(): Promise<string> {
  if (!existsSync(SEED_FILE)) {
    throw new Error(`${SEED_FILE} not found. Copy seed-users.example.json and adjust it.`);
  }
  const users = seedUsersSchema.parse(JSON.parse(readFileSync(SEED_FILE, "utf8")));
  const now = Date.now();
  const statements: string[] = [];

  for (const entry of users) {
    if (!isPasswordLengthValid(entry.password)) {
      throw new Error(`Password for "${entry.username}" does not meet the length rules.`);
    }
    const userId = crypto.randomUUID();
    const username = normalizeUsername(entry.username);
    const hash = await hashPassword(entry.password);
    statements.push(
      `INSERT INTO user (id, name, email, email_verified, username, display_username, role, created_at, updated_at)
VALUES (${sqlString(userId)}, ${sqlString(entry.name ?? entry.username)}, ${sqlString(placeholderEmail(username))}, 0, ${sqlString(username)}, ${sqlString(entry.username)}, ${sqlString(entry.role)}, ${now}, ${now})
ON CONFLICT(username) DO NOTHING;`,
      `INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT ${sqlString(crypto.randomUUID())}, u.id, 'credential', u.id, ${sqlString(hash)}, ${now}, ${now}
FROM user u
WHERE u.username = ${sqlString(username)}
  AND NOT EXISTS (SELECT 1 FROM account a WHERE a.user_id = u.id AND a.provider_id = 'credential');`,
    );
  }
  return statements.join("\n\n");
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const remote = args.includes("--remote");
  const envIndex = args.indexOf("--env");
  const env = envIndex >= 0 ? args[envIndex + 1] : undefined;
  const database = env === "staging" ? "clickfit-staging" : "clickfit";

  const dir = join(".wrangler", "tmp");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "seed.sql");
  writeFileSync(file, await buildSql(), { mode: 0o600 });

  try {
    const wranglerArgs = ["wrangler", "d1", "execute", database, remote ? "--remote" : "--local", "--file", file];
    if (env) wranglerArgs.push("--env", env);
    execFileSync("npx", wranglerArgs, { stdio: "inherit" });
    console.log(`Seeded users into ${database} (${remote ? "remote" : "local"}).`);
  } finally {
    rmSync(file, { force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
