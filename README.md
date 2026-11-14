# ClickFit

Private Fitness-Web-App für Krafttraining, Ernährung, Mobility und Cardio.
Läuft komplett auf Cloudflare (Workers, D1, R2) unter `clickfit.online`.

- Anforderungen: [docs/SPEC.md](docs/SPEC.md)
- Umsetzungsplan und Stand: [docs/ROADMAP.md](docs/ROADMAP.md)

**Stand:** Phase 1 (Fundament) ist fertig. Training, Ernährung und Fortschritt sind noch
Platzhalter.

## Technik

| Bereich | Lösung |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript strict, Tailwind CSS 4, shadcn/ui |
| Hosting | Cloudflare Workers über `@opennextjs/cloudflare` |
| Datenbank | Cloudflare D1 (SQLite) mit Drizzle ORM |
| Dateien | Cloudflare R2 (privater Bucket, ab Phase 4 genutzt) |
| Anmeldung | Better Auth, Login per Benutzername, Sessions in der Datenbank |
| Texte | next-intl, nur Deutsch, alle Texte in `messages/de/*.json` |
| Tests | Vitest gegen eine echte lokale D1 (Miniflare) |

## Projektregeln

1. Bezeichner (Variablen, Funktionen, Dateinamen) sind englisch. Kommentare, Commit-Messages
   und Doku sind deutsch.
2. Kein sichtbarer Text steht fest im Code. Alles läuft über `messages/de`. ESLint meldet
   Verstöße (`i18next/no-literal-string`).
3. Keine Quelldatei ist länger als 600 Zeilen (`npm run check:size`).
4. TypeScript strict, kein `any`.
5. Die Darstellung ist auf das iPhone ausgerichtet: Bedienelemente mindestens 44 px hoch,
   16 px Schrift in Eingabefeldern, Safe-Areas berücksichtigt.

## Lokal starten

Voraussetzung: Node.js 22 oder neuer.

```bash
npm install
```

```bash
cp .dev.vars.example .dev.vars
```

Trage in `.dev.vars` ein zufälliges `BETTER_AUTH_SECRET` ein (z. B. aus `openssl rand -base64 32`).

```bash
npm run db:migrate
```

Lege die Nutzer an. Kopiere dazu `seed-users.example.json` nach `seed-users.local.json`, trage
Benutzernamen und Passwörter ein und starte den Seed:

```bash
npm run db:seed
```

```bash
npm run dev
```

Die App läuft dann unter http://localhost:3000.

`npm run dev` läuft in Node.js. Um die App in der echten Workers-Laufzeit zu testen:

```bash
npm run preview
```

## Nutzer und Passwörter

- Es gibt nur fest angelegte Nutzer, keine Registrierung.
- Die Nutzer stehen in `seed-users.local.json`. Die Datei ist von Git ausgeschlossen und darf
  nie eingecheckt werden. In der Datenbank liegen nur scrypt-Hashes.
- Der Seed ist idempotent: Bestehende Nutzer bleiben unberührt, geänderte Passwörter werden
  nicht überschrieben.
- Jeder Nutzer ändert sein Passwort unter **Mehr → Einstellungen → Passwort ändern**.
- Der Admin kann unter **Mehr → Benutzer** für andere ein neues Passwort setzen.
- Mindestlänge für Passwörter: 8 Zeichen.
- Nach fünf Fehlversuchen in fünf Minuten sperrt das Rate-Limit weitere Anmeldungen pro
  IP-Adresse.

## Prüfungen

```bash
npm run check
```

Das führt Typprüfung, ESLint, die Zeilenprüfung und die Tests aus. Einzeln:

| Befehl | Zweck |
|---|---|
| `npm run typecheck` | TypeScript |
| `npm run lint` | ESLint inklusive i18n-Regel |
| `npm run check:size` | 600-Zeilen-Regel |
| `npm run test` | Tests (Rechte, Passwort-Hashing, Nutzer-Dienste, Anmeldung, Textkatalog) |

## Datenbank

Das Schema steht in `src/db/schema`. Nach einer Änderung:

```bash
npm run db:generate
```

```bash
npm run db:migrate
```

## Deployment auf Cloudflare

Einmalig einzurichten (im Cloudflare-Account, in dem die Zone `clickfit.online` liegt):

1. Workers Paid Plan aktivieren.
2. Anmelden: `npx wrangler login`
3. Datenbank anlegen und die ausgegebene ID in `wrangler.jsonc` bei `database_id` eintragen:
   `npx wrangler d1 create clickfit --location weur`
4. Bucket anlegen: `npx wrangler r2 bucket create clickfit-uploads --jurisdiction eu`
5. Secret setzen: `npx wrangler secret put BETTER_AUTH_SECRET`
6. Migrationen einspielen: `npm run db:migrate:prod`
7. Nutzer anlegen: `npm run db:seed -- --remote`
8. Deployen: `npm run deploy`

Für die Testumgebung (`clickfit-staging` unter `*.workers.dev`) dieselben Schritte mit
`--env staging` bzw. `npm run db:migrate:staging`, `npm run db:seed -- --remote --env staging`
und `npm run deploy:staging`. Trage vorher in `wrangler.jsonc` die Staging-`database_id` und
unter `env.staging.vars.APP_URL` die echte workers.dev-Adresse ein.

Empfohlen als zweite Schutzschicht: eine Cloudflare-WAF-Regel mit Rate-Limit auf
`/api/auth/sign-in/*`.

### Backup

```bash
npm run db:backup
```

Das schreibt einen SQL-Export nach `backups/`. Zusätzlich bietet D1 „Time Travel“
(Wiederherstellung auf einen Zeitpunkt der letzten 30 Tage).

## Datenschutz

Alle Daten liegen bei Cloudflare: die Datenbank in Westeuropa, Uploads im R2-Bucket mit
EU-Jurisdiktion. Der Bucket ist privat. Dateien werden nur über die App nach Prüfung der
Anmeldung ausgeliefert.

## Projektstruktur

```
docs/                Spezifikation und Umsetzungsplan
drizzle/migrations/  SQL-Migrationen für D1
messages/de/         alle Texte der Oberfläche
scripts/             Seed, Icon-Erzeugung, Zeilenprüfung
src/app/             Seiten und API-Routen
src/components/      Layout, Formular-Bausteine, shadcn/ui
src/db/              Drizzle-Schema und Client
src/domain/          reine Fachlogik ohne Framework (testbar)
src/features/        Fachbereiche: Dienste, Server Actions, Komponenten
src/lib/             Auth, Fehlercodes, Cloudflare-Kontext
src/sw/              Service Worker (wird nach public/sw.js gebaut)
tests/               Vitest-Tests
```
