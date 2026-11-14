import { defineConfig } from "drizzle-kit";

// Migrationen erzeugt drizzle-kit; eingespielt werden sie mit `wrangler d1 migrations apply`.
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle/migrations",
  casing: "snake_case",
});
