<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## ClickFit – Projektregeln

Maßgeblich sind `docs/SPEC.md` (Anforderungen) und `docs/ROADMAP.md` (Phasen und Stand).

- Bezeichner (Variablen, Funktionen, Dateinamen) englisch; Kommentare, Commit-Messages und Doku deutsch.
- Die App gibt es nur auf Deutsch. Kein sichtbarer Text steht im Code: alles in `messages/de/*.json` (next-intl).
- Keine Quelldatei über 600 Zeilen. TypeScript strict, kein `any`.
- Darstellung zuerst fürs iPhone: Bedienelemente mindestens 44 px, 16 px Schrift in Eingabefeldern, Safe-Areas.
- Hosting komplett auf Cloudflare (Workers, D1 mit Drizzle, R2). Kein Docker, kein Prisma.
- Login per Benutzername, ohne E-Mail, Registrierung oder Einladungen. Konten legt nur der Admin an (Mehr → Benutzer); diese Lösung bleibt unverändert.
- Echte Passwörter stehen nur in `seed-users.local.json` (von Git ausgeschlossen), nie im Code oder in Commits.
- Fachlogik liegt ohne Framework in `src/domain` und hat Tests. Pro Phase: Tests, aktuelle README, Seed-Daten.
- Vor jedem Commit: `npm run check`.
- Nach Abnahme einer Phase keine Änderungen an bestehenden Funktionen oder der Oberfläche ohne Absprache.
