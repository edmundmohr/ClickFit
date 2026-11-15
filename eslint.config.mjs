import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import i18next from "eslint-plugin-i18next";

// Attribute, deren Text Nutzer sehen oder vorgelesen bekommen: Auch sie müssen über i18n laufen.
const USER_VISIBLE_ATTRIBUTES = [
  "label",
  "hint",
  "placeholder",
  "title",
  "alt",
  "aria-label",
  "pendingLabel",
  "description",
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Regel 2 des Projekts: keine fest codierten UI-Texte.
    files: ["src/**/*.tsx"],
    ignores: ["src/components/ui/**"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-only",
          "jsx-attributes": { include: USER_VISIBLE_ATTRIBUTES },
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".open-next/**",
    ".wrangler/**",
    "out/**",
    "build/**",
    "public/sw.js",
    "next-env.d.ts",
    "cloudflare-env.d.ts",
    // Worktrees anderer Sitzungen und erzeugte Auswertungen: eigene Kopien des Projekts,
    // die den Linter im Haupt-Checkout sonst bis zum Speichermangel beschäftigen.
    ".claude/**",
    "graphify-out/**",
  ]),
]);

export default eslintConfig;
