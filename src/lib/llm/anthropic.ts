/**
 * KI-Anbieter Anthropic (Claude) über das offizielle SDK. Die Antwort kommt als strukturierte
 * Ausgabe: Das Modell muss sich an das übergebene Schema halten.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";
import type { LlmProvider, LlmRequest, LlmResult } from "./types";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
/** Lehnt das Modell eine Anfrage ab, darf der Anbieter sie auf einem Ausweich-Modell wiederholen. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_TOKENS = 16000;
/** Eine Antwort soll den Nutzer nicht minutenlang warten lassen. */
const TIMEOUT_MS = 90_000;

export interface AnthropicOptions {
  apiKey: string;
  model?: string;
  /** Nur für Tests: ersetzt den Netzwerkzugriff. */
  fetch?: typeof fetch;
}

export function createAnthropicProvider(options: AnthropicOptions): LlmProvider {
  const model = options.model || DEFAULT_ANTHROPIC_MODEL;
  const client = new Anthropic({
    apiKey: options.apiKey,
    fetch: options.fetch,
    timeout: TIMEOUT_MS,
    maxRetries: 1,
  });

  async function generate<Schema extends z.ZodType>(
    request: LlmRequest<Schema>,
  ): Promise<LlmResult<z.infer<Schema>>> {
    try {
      const response = await client.beta.messages.parse({
        model,
        max_tokens: MAX_TOKENS,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        // Denken ist bei diesem Modell immer an; die Gründlichkeit steuert allein `effort`.
        output_config: { effort: request.effort, format: betaZodOutputFormat(request.schema) },
        system: request.system,
        messages: [
          {
            role: "user",
            content: [
              ...(request.images ?? []).map((image) => ({
                type: "image" as const,
                source: { type: "base64" as const, media_type: image.mediaType, data: image.base64 },
              })),
              { type: "text" as const, text: request.prompt },
            ],
          },
        ],
      });
      if (response.stop_reason === "refusal") return { status: "refused" };
      if (response.stop_reason !== "end_turn" || response.parsed_output === null) return { status: "failed" };
      return { status: "ok", data: response.parsed_output as z.infer<Schema>, model: response.model };
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        console.error("Anthropic rejected the API key:", error.status);
        return { status: "unavailable" };
      }
      if (error instanceof Anthropic.APIError) {
        // Nur Status und Art protokollieren: Die Fehlermeldung kann Teile der Anfrage enthalten.
        console.error("Anthropic request failed:", error.status, error.name);
        return { status: "failed" };
      }
      console.error("Anthropic response could not be used:", error instanceof Error ? error.name : "unknown");
      return { status: "failed" };
    }
  }

  return { name: "Anthropic", model, generate };
}
