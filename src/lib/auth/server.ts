import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { createDb } from "@/db/client";
import * as schema from "@/db/schema";
import { getEnv } from "@/lib/server/context";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  hashPassword,
  verifyPassword,
} from "./password";

const DAY_SECONDS = 60 * 60 * 24;

/**
 * Endpunkte von Better Auth, die die App nicht braucht und die über HTTP nicht erreichbar sein
 * dürfen: Die Konten sind fest angelegt. Benutzername, Name, E-Mail und Passwort ändern sich
 * nur über die eigenen, geprüften Aktionen (Profil, Passwort) – sonst ließe sich z. B. über
 * `/update-user` der Login-Name ohne jede Prüfung ändern. Aufrufe auf dem Server über
 * `auth.api` (Sitzung lesen, Abmelden) sind davon nicht betroffen.
 */
export const DISABLED_AUTH_PATHS = [
  "/update-user",
  "/change-email",
  "/change-password",
  "/verify-password",
  "/delete-user",
  "/delete-user/callback",
  "/is-username-available",
  "/update-session",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  "/verify-email",
  "/link-social",
  "/unlink-account",
];

/**
 * Better Auth übernimmt Anmeldung (per Benutzername), Abmeldung, Sessions, Cookies,
 * CSRF-/Origin-Prüfung und das Login-Rate-Limit. Registrierung ist abgeschaltet: Die wenigen
 * Konten legt das Seed-Skript an (scripts/seed.ts).
 */
export function createAuth(env: CloudflareEnv) {
  const db = createDb(env.DB);
  return betterAuth({
    appName: "ClickFit",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.APP_URL,
    trustedOrigins: [env.APP_URL],
    database: drizzleAdapter(db, { provider: "sqlite", schema, transaction: false }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      password: { hash: hashPassword, verify: verifyPassword },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "user", input: false },
        theme: { type: "string", required: false, defaultValue: "system", input: false },
        unitSystem: { type: "string", required: false, defaultValue: "metric", input: false },
      },
    },
    session: {
      expiresIn: 30 * DAY_SECONDS,
      updateAge: DAY_SECONDS,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/username": { window: 5 * 60, max: 5 },
        "/sign-in/email": { window: 5 * 60, max: 5 },
      },
    },
    advanced: {
      // Cloudflare setzt cf-connecting-ip selbst; Clients können den Header nicht fälschen.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
      useSecureCookies: env.APP_URL.startsWith("https://"),
      // Origin- und CSRF-Prüfung ausdrücklich erzwingen (auch in Test- und Dev-Umgebungen).
      disableOriginCheck: false,
      disableCSRFCheck: false,
      database: { generateId: "uuid" },
    },
    disabledPaths: DISABLED_AUTH_PATHS,
    telemetry: { enabled: false },
    plugins: [username(), nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export function getAuth(): Auth {
  return createAuth(getEnv());
}
