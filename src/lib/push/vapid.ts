/**
 * VAPID (RFC 8292): Der Server weist sich gegenüber dem Push-Dienst des Browsers mit einem
 * signierten Token aus. Nutzt nur Web Crypto und läuft damit auf Cloudflare Workers.
 */

const encoder = new TextEncoder();

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export interface VapidKeys {
  /** Öffentlicher Schlüssel: 65 Bytes (unkomprimierter P-256-Punkt), base64url. */
  publicKey: string;
  /** Privater Schlüssel: 32 Bytes, base64url. Gehört nur in Secrets. */
  privateKey: string;
}

const PUBLIC_KEY_BYTES = 65;
const COORDINATE_BYTES = 32;
/** Push-Dienste akzeptieren höchstens 24 Stunden; zwölf lassen Spielraum für Uhrabweichungen. */
const TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

async function importPrivateKey(keys: VapidKeys): Promise<CryptoKey> {
  const publicBytes = fromBase64Url(keys.publicKey);
  if (publicBytes.length !== PUBLIC_KEY_BYTES || publicBytes[0] !== 4) throw new Error("Invalid VAPID public key");
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: toBase64Url(publicBytes.slice(1, 1 + COORDINATE_BYTES)),
      y: toBase64Url(publicBytes.slice(1 + COORDINATE_BYTES)),
      d: keys.privateKey,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** Erzeugt ein neues Schlüsselpaar im Format, das Browser und Push-Dienste erwarten. */
export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  if (!jwk.d) throw new Error("Private key export failed");
  return { publicKey: toBase64Url(publicRaw), privateKey: jwk.d };
}

export interface VapidTokenInput {
  /** Ursprung des Push-Endpunkts, z. B. `https://web.push.apple.com`. */
  audience: string;
  /** Kontakt des Absenders als `https:`- oder `mailto:`-Adresse. */
  subject: string;
  keys: VapidKeys;
  now?: Date;
}

/** Signiertes Token (JWT mit ES256) für den `Authorization`-Header. */
export async function createVapidToken(input: VapidTokenInput): Promise<string> {
  const issuedAt = Math.floor((input.now ?? new Date()).getTime() / 1000);
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = toBase64Url(
    encoder.encode(JSON.stringify({ aud: input.audience, exp: issuedAt + TOKEN_LIFETIME_SECONDS, sub: input.subject })),
  );
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await importPrivateKey(input.keys),
    encoder.encode(unsigned),
  );
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;
}
