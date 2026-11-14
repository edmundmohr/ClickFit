import { describe, expect, it } from "vitest";
import { pushConfigOf } from "@/lib/push/config";
import { isAllowedPushEndpoint, sendPush } from "@/lib/push/send";
import { createVapidToken, fromBase64Url, generateVapidKeys, toBase64Url } from "@/lib/push/vapid";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

describe("VAPID", () => {
  it("round-trips base64url without padding", () => {
    const bytes = new Uint8Array([0, 250, 251, 252, 253, 254, 255, 62, 63]);
    const encoded = toBase64Url(bytes);
    expect(encoded).not.toMatch(/[+/=]/);
    expect([...fromBase64Url(encoded)]).toEqual([...bytes]);
  });

  it("generates keys in the format browsers expect", async () => {
    const keys = await generateVapidKeys();
    expect(fromBase64Url(keys.publicKey)).toHaveLength(65);
    expect(fromBase64Url(keys.publicKey)[0]).toBe(4);
    expect(fromBase64Url(keys.privateKey)).toHaveLength(32);
  });

  it("signs a token the push service can verify with the public key", async () => {
    const keys = await generateVapidKeys();
    const now = new Date("2026-11-14T10:00:00Z");
    const token = await createVapidToken({ audience: "https://web.push.apple.com", subject: "https://clickfit.online", keys, now });
    const [header, payload, signature] = token.split(".");
    expect(JSON.parse(decoder.decode(fromBase64Url(header)))).toEqual({ typ: "JWT", alg: "ES256" });
    const claims = JSON.parse(decoder.decode(fromBase64Url(payload))) as { aud: string; exp: number; sub: string };
    expect(claims).toMatchObject({ aud: "https://web.push.apple.com", sub: "https://clickfit.online" });
    const lifetime = claims.exp - now.getTime() / 1000;
    expect(lifetime).toBeGreaterThan(0);
    expect(lifetime).toBeLessThanOrEqual(24 * 60 * 60);

    const publicKey = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(keys.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      fromBase64Url(signature),
      encoder.encode(`${header}.${payload}`),
    );
    expect(valid).toBe(true);
    expect(fromBase64Url(signature)).toHaveLength(64);
  });

  it("rejects a malformed public key", async () => {
    const keys = await generateVapidKeys();
    await expect(
      createVapidToken({ audience: "https://web.push.apple.com", subject: "https://clickfit.online", keys: { ...keys, publicKey: "abc" } }),
    ).rejects.toThrow();
  });
});

describe("push delivery", () => {
  it("only talks to the push services of browsers", () => {
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGd3")).toBe(true);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(isAllowedPushEndpoint("http://web.push.apple.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://evil.example/web.push.apple.com")).toBe(false);
    expect(isAllowedPushEndpoint("https://push.apple.com.evil.example/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://web.push.apple.com:8443/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://user@web.push.apple.com/x")).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/x")).toBe(false);
    expect(isAllowedPushEndpoint("not a url")).toBe(false);
  });

  it("sends an empty, signed request and reports the outcome", async () => {
    const keys = await generateVapidKeys();
    const calls: { url: string; init: RequestInit }[] = [];
    const respond = (status: number): typeof fetch =>
      (async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(null, { status });
      }) as typeof fetch;
    const base = { endpoint: "https://web.push.apple.com/abc", keys, subject: "https://clickfit.online", ttlSeconds: 60 };

    expect(await sendPush({ ...base, fetcher: respond(201) })).toBe("sent");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.body).toBeUndefined();
    expect(headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${keys.publicKey}$`));
    expect(headers.TTL).toBe("60");

    expect(await sendPush({ ...base, fetcher: respond(410) })).toBe("gone");
    expect(await sendPush({ ...base, fetcher: respond(404) })).toBe("gone");
    expect(await sendPush({ ...base, fetcher: respond(500) })).toBe("failed");
    const failing = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    expect(await sendPush({ ...base, fetcher: failing })).toBe("failed");
  });

  it("never contacts an endpoint outside the allow list", async () => {
    const keys = await generateVapidKeys();
    let called = false;
    const fetcher = (async () => {
      called = true;
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    expect(await sendPush({ endpoint: "https://internal.example/hook", keys, subject: "https://clickfit.online", ttlSeconds: 60, fetcher })).toBe("gone");
    expect(called).toBe(false);
  });

  it("is switched off without keys", () => {
    expect(pushConfigOf({ APP_URL: "https://clickfit.online" })).toBeNull();
    expect(pushConfigOf({ APP_URL: "https://clickfit.online", VAPID_PUBLIC_KEY: "a", VAPID_PRIVATE_KEY: "b" })).toEqual({
      keys: { publicKey: "a", privateKey: "b" },
      subject: "https://clickfit.online",
    });
  });
});
