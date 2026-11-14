import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Passwort-Hashing mit scrypt aus `node:crypto`.
 * Läuft in Node.js und in Cloudflare Workers (nodejs_compat), wo es keine
 * nativen argon2-Module gibt.
 *
 * Gespeichertes Format: `scrypt$<N>$<r>$<p>$<saltBase64>$<hashBase64>`. So lassen sich
 * die Kostenparameter später erhöhen, ohne bestehende Hashes ungültig zu machen.
 */

const PREFIX = "scrypt";
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const DEFAULT_PARAMS = { N: 2 ** 15, r: 8, p: 1 } as const;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

interface ScryptParams {
  N: number;
  r: number;
  p: number;
}

function deriveKey(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  // scrypt braucht 128 * N * r Bytes Speicher; das Doppelte als Reserve erlauben.
  const maxmem = 256 * params.N * params.r;
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEY_LENGTH,
      { ...params, maxmem },
      (error, derivedKey) => {
        if (error) reject(error);
        else resolve(derivedKey);
      },
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, DEFAULT_PARAMS);
  const { N, r, p } = DEFAULT_PARAMS;
  return [PREFIX, N, r, p, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(input: { hash: string; password: string }): Promise<boolean> {
  const parts = input.hash.split("$");
  if (parts.length !== 6 || parts[0] !== PREFIX) return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const params: ScryptParams = { N: Number(n), r: Number(r), p: Number(p) };
  if (![params.N, params.r, params.p].every((value) => Number.isInteger(value) && value > 0)) {
    return false;
  }
  const expected = Buffer.from(keyB64, "base64");
  const actual = await deriveKey(input.password, Buffer.from(saltB64, "base64"), params);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isPasswordLengthValid(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}
