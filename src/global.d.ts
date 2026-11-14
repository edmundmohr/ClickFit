import type { Locale } from "@/i18n/config";
import type { Messages } from "../messages";

declare module "next-intl" {
  interface AppConfig {
    Locale: Locale;
    Messages: Messages;
  }
}

declare global {
  /**
   * Optionale Secrets, die nicht in `.dev.vars` stehen müssen und deshalb von `wrangler types`
   * nicht erfasst werden. Fehlen sie, sind die KI-Funktionen ausgeblendet.
   */
  interface CloudflareEnv {
    /** Schlüssel für den KI-Anbieter Anthropic. */
    ANTHROPIC_API_KEY?: string;
    /** Optional: anderes KI-Modell als das Standardmodell. */
    LLM_MODEL?: string;
  }
}
