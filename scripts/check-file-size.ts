/**
 * Regel 3 des Projekts: Keine Quelldatei darf länger als 600 Zeilen sein.
 * Generierte Dateien sind ausgenommen. Aufruf: `npm run check:size`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MAX_LINES = 600;
const ROOTS = ["src", "scripts", "tests", "messages"];
const EXTENSIONS = [".ts", ".tsx", ".css", ".json"];

function collectFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return collectFiles(path);
    return EXTENSIONS.some((extension) => path.endsWith(extension)) ? [path] : [];
  });
}

const tooLong = ROOTS.flatMap(collectFiles)
  .map((file) => ({ file, lines: readFileSync(file, "utf8").split("\n").length }))
  .filter((entry) => entry.lines > MAX_LINES);

if (tooLong.length > 0) {
  for (const entry of tooLong) console.error(`${entry.file}: ${entry.lines} lines (max ${MAX_LINES})`);
  process.exit(1);
}
console.log(`All source files are within ${MAX_LINES} lines.`);
