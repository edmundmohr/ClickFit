/**
 * Erzeugt die PWA-Icons (PNG) ohne externe Abhängigkeiten.
 * Zeichnet eine Hantel auf ein dunkles, abgerundetes Quadrat. Aufruf: `npm run icons`.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { crc32, deflateSync } from "node:zlib";

type Rgb = [number, number, number];

const BACKGROUND: Rgb = [10, 10, 10];
const GLYPH: Rgb = [163, 230, 53];
const SUPERSAMPLING = 4;

interface IconSpec {
  file: string;
  size: number;
  /** Eckenradius des Hintergrunds als Anteil der Größe (0 = Quadrat bis zum Rand). */
  radius: number;
  /** Skalierung der Hantel; maskierbare Icons halten sie in der sicheren Zone. */
  glyphScale: number;
}

const ICONS: IconSpec[] = [
  { file: "icon-192.png", size: 192, radius: 0.22, glyphScale: 1 },
  { file: "icon-512.png", size: 512, radius: 0.22, glyphScale: 1 },
  { file: "icon-maskable-512.png", size: 512, radius: 0, glyphScale: 0.72 },
  { file: "apple-touch-icon.png", size: 180, radius: 0, glyphScale: 0.9 },
  { file: "favicon-32.png", size: 32, radius: 0.22, glyphScale: 1.1 },
];

/** Rechtecke der Hantel in Einheitskoordinaten (Mitte bei 0, Breite/Höhe als Anteile). */
const GLYPH_RECTS: { cx: number; w: number; h: number }[] = [
  { cx: 0, w: 0.4, h: 0.07 },
  { cx: -0.2, w: 0.09, h: 0.4 },
  { cx: 0.2, w: 0.09, h: 0.4 },
  { cx: -0.3, w: 0.07, h: 0.26 },
  { cx: 0.3, w: 0.07, h: 0.26 },
];

function insideBackground(x: number, y: number, radius: number): boolean {
  if (radius === 0) return true;
  const dx = Math.max(radius - x, 0, x - (1 - radius));
  const dy = Math.max(radius - y, 0, y - (1 - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function insideGlyph(x: number, y: number, scale: number): boolean {
  const ux = (x - 0.5) / scale;
  const uy = (y - 0.5) / scale;
  return GLYPH_RECTS.some((r) => Math.abs(ux - r.cx) <= r.w / 2 && Math.abs(uy) <= r.h / 2);
}

function renderIcon(spec: IconSpec): Buffer {
  const { size } = spec;
  const rowLength = size * 4 + 1;
  const raw = Buffer.alloc(rowLength * size);
  const samples = SUPERSAMPLING * SUPERSAMPLING;

  for (let py = 0; py < size; py++) {
    raw[py * rowLength] = 0; // PNG-Filtertyp „none“
    for (let px = 0; px < size; px++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let covered = 0;
      for (let sy = 0; sy < SUPERSAMPLING; sy++) {
        for (let sx = 0; sx < SUPERSAMPLING; sx++) {
          const x = (px + (sx + 0.5) / SUPERSAMPLING) / size;
          const y = (py + (sy + 0.5) / SUPERSAMPLING) / size;
          if (!insideBackground(x, y, spec.radius)) continue;
          const color = insideGlyph(x, y, spec.glyphScale) ? GLYPH : BACKGROUND;
          r += color[0];
          g += color[1];
          b += color[2];
          covered++;
        }
      }
      const offset = py * rowLength + 1 + px * 4;
      if (covered > 0) {
        raw[offset] = Math.round(r / covered);
        raw[offset + 1] = Math.round(g / covered);
        raw[offset + 2] = Math.round(b / covered);
      }
      raw[offset + 3] = Math.round((covered / samples) * 255);
    }
  }
  return encodePng(size, size, raw);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

function encodePng(width: number, height: number, raw: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // Bittiefe
  header[9] = 6; // Farbtyp RGBA
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = join("public", "icons");
mkdirSync(outDir, { recursive: true });
for (const spec of ICONS) {
  writeFileSync(join(outDir, spec.file), renderIcon(spec));
  console.log(`wrote ${join(outDir, spec.file)}`);
}
