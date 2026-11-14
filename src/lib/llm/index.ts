import { createAnthropicProvider } from "./anthropic";
import type { LlmProvider } from "./types";

export interface LlmEnvironment {
  ANTHROPIC_API_KEY?: string;
  /** Optional: anderes Modell als das Standardmodell. */
  LLM_MODEL?: string;
}

/** Der eingerichtete KI-Anbieter; `null`, wenn kein Schlüssel hinterlegt ist. */
export function getLlmProvider(env: LlmEnvironment): LlmProvider | null {
  if (!env.ANTHROPIC_API_KEY) return null;
  return createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.LLM_MODEL });
}

export type { LlmEffort, LlmImage, LlmProvider, LlmRequest, LlmResult } from "./types";
