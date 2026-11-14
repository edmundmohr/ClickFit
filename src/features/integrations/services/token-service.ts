/**
 * API-Token für den Import von außen (Health-Apps, Home Assistant).
 * Gespeichert wird nur der SHA-256-Hash; der Token selbst ist genau einmal beim Anlegen sichtbar.
 */
import { and, count, desc, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { apiToken } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { newId } from "@/lib/tokens";
import { MAX_TOKENS_PER_USER, TOKEN_NAME_MAX_LENGTH } from "../constants";

export const TOKEN_PREFIX = "cf_";
/** 30 Zufallsbytes ergeben 40 URL-sichere Zeichen (240 Bit). */
const TOKEN_BYTES = 30;
/** So viele Zeichen des Tokens bleiben zum Wiedererkennen sichtbar (`cf_` plus acht Zeichen). */
const VISIBLE_LENGTH = TOKEN_PREFIX.length + 8;
const TOKEN_PATTERN = /^cf_[A-Za-z0-9_-]{32,125}$/;
/** `lastUsedAt` wird höchstens so oft geschrieben, damit nicht jeder Aufruf eine Schreiblast erzeugt. */
const LAST_USED_INTERVAL_MS = 60_000;

export interface ApiTokenView {
  id: string;
  name: string;
  /** Anfang des Tokens. */
  prefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

export interface CreatedApiToken extends ApiTokenView {
  /** Der Token im Klartext; nur hier und nur einmal. */
  token: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function generateToken(): string {
  return TOKEN_PREFIX + toBase64Url(crypto.getRandomValues(new Uint8Array(TOKEN_BYTES)));
}

/** SHA-256 des Tokens als Hex-Text. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Legt einen Token an. Höchstens `MAX_TOKENS_PER_USER` je Nutzer; der Name hat 1–40 Zeichen. */
export async function createToken(db: AppDatabase, userId: string, name: string, now = new Date()): Promise<CreatedApiToken> {
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > TOKEN_NAME_MAX_LENGTH) throw new AppError("VALIDATION");
  const [existing] = await db.select({ total: count() }).from(apiToken).where(eq(apiToken.userId, userId));
  if ((existing?.total ?? 0) >= MAX_TOKENS_PER_USER) throw new AppError("TOKEN_LIMIT");

  const token = generateToken();
  const view: ApiTokenView = { id: newId(), name: trimmed, prefix: token.slice(0, VISIBLE_LENGTH), createdAt: now, lastUsedAt: null };
  await db.insert(apiToken).values({ ...view, userId, tokenHash: await hashToken(token) });
  return { ...view, token };
}

/** Token des Nutzers ohne Hash, neueste zuerst. */
export async function listTokens(db: AppDatabase, userId: string): Promise<ApiTokenView[]> {
  return db
    .select({
      id: apiToken.id,
      name: apiToken.name,
      prefix: apiToken.prefix,
      createdAt: apiToken.createdAt,
      lastUsedAt: apiToken.lastUsedAt,
    })
    .from(apiToken)
    .where(eq(apiToken.userId, userId))
    .orderBy(desc(apiToken.createdAt));
}

/** Löscht einen eigenen Token; fremde oder unbekannte Kennungen ergeben `NOT_FOUND`. */
export async function deleteToken(db: AppDatabase, userId: string, tokenId: string): Promise<void> {
  const deleted = await db
    .delete(apiToken)
    .where(and(eq(apiToken.id, tokenId), eq(apiToken.userId, userId)))
    .returning({ id: apiToken.id });
  if (deleted.length === 0) throw new AppError("NOT_FOUND");
}

/**
 * Prüft einen vorgelegten Token und gibt den Nutzer zurück, sonst `null`.
 * Gesucht wird über den Hash (eindeutiger Index); der Vergleich hängt damit nicht am Klartext.
 */
export async function authenticateToken(db: AppDatabase, token: string, now = new Date()): Promise<string | null> {
  if (!TOKEN_PATTERN.test(token)) return null;
  const row = await db.query.apiToken.findFirst({
    columns: { id: true, userId: true, lastUsedAt: true },
    where: eq(apiToken.tokenHash, await hashToken(token)),
  });
  if (!row) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_INTERVAL_MS) {
    await db.update(apiToken).set({ lastUsedAt: now }).where(eq(apiToken.id, row.id));
  }
  return row.userId;
}
