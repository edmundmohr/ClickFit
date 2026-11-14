/**
 * Erzeugt das Schlüsselpaar für Web Push (VAPID).
 *
 * - Der private Schlüssel wird in `.dev.vars` geschrieben (von Git ausgeschlossen) und nie ausgegeben.
 * - Der öffentliche Schlüssel wird ausgegeben; er gehört nach `wrangler.jsonc` (`vars.VAPID_PUBLIC_KEY`).
 * - Gibt es schon einen privaten Schlüssel, passiert nichts: Ein neues Paar würde alle
 *   bestehenden Push-Abos ungültig machen.
 *
 * Aufruf: npx tsx scripts/generate-vapid-keys.ts
 * Für Produktion danach: den Wert aus `.dev.vars` mit `wrangler secret put VAPID_PRIVATE_KEY` setzen.
 */
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { generateVapidKeys } from "../src/lib/push/vapid";

const DEV_VARS = ".dev.vars";
const NAME = "VAPID_PRIVATE_KEY";

async function main(): Promise<void> {
  const current = existsSync(DEV_VARS) ? readFileSync(DEV_VARS, "utf8") : "";
  if (new RegExp(`^${NAME}=.+`, "m").test(current)) {
    console.log(`${NAME} already exists in ${DEV_VARS}. Nothing changed.`);
    return;
  }
  const keys = await generateVapidKeys();
  appendFileSync(DEV_VARS, `${current.endsWith("\n") || current === "" ? "" : "\n"}${NAME}=${keys.privateKey}\n`, { mode: 0o600 });
  console.log(`Private key written to ${DEV_VARS}.`);
  console.log(`Public key (for wrangler.jsonc, vars.VAPID_PUBLIC_KEY): ${keys.publicKey}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
