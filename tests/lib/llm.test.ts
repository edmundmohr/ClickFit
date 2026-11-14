import { describe, expect, it } from "vitest";
import { z } from "zod";
import { getLlmProvider } from "@/lib/llm";
import { DEFAULT_ANTHROPIC_MODEL, createAnthropicProvider } from "@/lib/llm/anthropic";

const schema = z.object({ answer: z.string(), score: z.number().nullable() });

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

/** Ersetzt den Netzwerkzugriff des SDK: zeichnet die Anfrage auf und liefert eine feste Antwort. */
function fakeFetch(respond: () => Response) {
  const calls: Captured[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push({ url: request.url, headers: request.headers, body: (await request.json()) as Record<string, unknown> });
    return respond();
  }) as typeof fetch;
  return { calls, fetcher };
}

function message(text: string, stopReason = "end_turn"): Response {
  return Response.json({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: DEFAULT_ANTHROPIC_MODEL,
    content: stopReason === "refusal" ? [] : [{ type: "text", text }],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  });
}

const request = { system: "Regeln", prompt: "Aufgabe", schema, effort: "medium" as const };

describe("Anthropic provider", () => {
  it("sends a structured request and returns the parsed answer", async () => {
    const { calls, fetcher } = fakeFetch(() => message(JSON.stringify({ answer: "ja", score: 3 })));
    const provider = createAnthropicProvider({ apiKey: "test-key", fetch: fetcher });
    const result = await provider.generate({
      ...request,
      images: [{ mediaType: "image/jpeg", base64: "QUJD" }],
    });
    expect(result).toEqual({ status: "ok", data: { answer: "ja", score: 3 }, model: DEFAULT_ANTHROPIC_MODEL });

    const [call] = calls;
    expect(call.url).toContain("/v1/messages");
    // Das SDK schickt den Schlüssel im Authorization-Header.
    expect(call.headers.get("authorization")).toContain("test-key");
    expect(call.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(call.body).toMatchObject({ model: "claude-opus-5-5", system: "Regeln", fallbacks: "default" });
    // Denken lässt sich bei diesem Modell nicht abschalten und wird nicht konfiguriert; gesteuert wird über `effort`.
    expect(call.body.thinking).toBeUndefined();
    expect(call.body.temperature).toBeUndefined();
    expect(call.body.tool_choice).toBeUndefined();
    const output = call.body.output_config as { effort: string; format: { type: string; schema: unknown } };
    expect(output.effort).toBe("medium");
    expect(output.format.type).toBe("json_schema");
    expect(JSON.stringify(output.format.schema)).toContain("answer");
    const [user] = call.body.messages as { role: string; content: { type: string }[] }[];
    expect(user.role).toBe("user");
    expect(user.content.map((block) => block.type)).toEqual(["image", "text"]);
    expect(user.content[0]).toMatchObject({ source: { type: "base64", media_type: "image/jpeg", data: "QUJD" } });
  });

  it("reports a refusal instead of reading content", async () => {
    const { fetcher } = fakeFetch(() => message("", "refusal"));
    const provider = createAnthropicProvider({ apiKey: "test-key", fetch: fetcher });
    expect(await provider.generate(request)).toEqual({ status: "refused" });
  });

  it("treats a cut-off or malformed answer as failed", async () => {
    const cut = createAnthropicProvider({ apiKey: "k", fetch: fakeFetch(() => message('{"answer": "ja', "max_tokens")).fetcher });
    expect(await cut.generate(request)).toEqual({ status: "failed" });
    const wrong = createAnthropicProvider({ apiKey: "k", fetch: fakeFetch(() => message(JSON.stringify({ other: 1 }))).fetcher });
    expect(await wrong.generate(request)).toEqual({ status: "failed" });
  });

  it("distinguishes a rejected key from a temporary error", async () => {
    const error = (status: number, type: string) => () =>
      Response.json({ type: "error", error: { type, message: "x" } }, { status });
    const denied = createAnthropicProvider({ apiKey: "bad", fetch: fakeFetch(error(401, "authentication_error")).fetcher });
    expect(await denied.generate(request)).toEqual({ status: "unavailable" });
    const invalid = createAnthropicProvider({ apiKey: "k", fetch: fakeFetch(error(400, "invalid_request_error")).fetcher });
    expect(await invalid.generate(request)).toEqual({ status: "failed" });
  });

  it("is only available with a key and lets the model be overridden", () => {
    expect(getLlmProvider({})).toBeNull();
    expect(getLlmProvider({ ANTHROPIC_API_KEY: "" })).toBeNull();
    expect(getLlmProvider({ ANTHROPIC_API_KEY: "k" })).toMatchObject({ name: "Anthropic", model: "claude-opus-5-5" });
    expect(getLlmProvider({ ANTHROPIC_API_KEY: "k", LLM_MODEL: "claude-haiku-5-5" })?.model).toBe("claude-haiku-5-5");
  });
});
