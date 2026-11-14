# ClickFit

Private Fitness-Web-App für Krafttraining, Ernährung, Mobility und Cardio.
Läuft komplett auf Cloudflare (Workers, D1, R2) unter `clickfit.online`.

- Anforderungen: [docs/SPEC.md](docs/SPEC.md)
- Umsetzungsplan und Stand: [docs/ROADMAP.md](docs/ROADMAP.md)

**Stand:** Phase 1 (Fundament), Phase 2 (Training-Kern) und Phase 3 (Ernährung) sind fertig.
Fortschritt ist noch ein Platzhalter.

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
| `npm run test` | Tests (Rechte, Anmeldung, Plan-Generator, Progression, Rekorde, Streaks, Kalorien und Makros, adaptiver Verbrauch, Trainings- und Ernährungs-Dienste) |

## Training (Phase 2)

- **Übungsbibliothek:** 232 Übungen liegen als Daten im Code (`src/data/exercises`). Sie brauchen
  keinen Seed und keine Migration. Trainingsdaten verweisen über die Kennung der Übung darauf.
- **Fragebogen:** unter `/onboarding`. Daraus entsteht der Plan; „Plan neu erstellen“ erzeugt ihn
  aus dem gespeicherten Profil erneut.
- **Plan-Generator:** `src/domain/training/plan-generator`. Gleiche Eingaben ergeben immer
  denselben Plan.
- **Progression:** `src/domain/training/progression.ts`. Erreichen die Wiederholungen das obere
  Ende des Bereichs, steigt das Gewicht um die kleinste Stufe und die Wiederholungen beginnen
  wieder unten. Jeder Satz wird einzeln bewertet. Die letzte Woche jedes Blocks ist eine
  Deload-Woche (weniger Sätze, etwa 10 % weniger Gewicht).
- **Trainingsmodus:** unter `/workout/<id>`, ohne Tab-Leiste. Jede Eingabe wird sofort
  gespeichert; nach einem Neuladen ist der Stand wieder da. Es gibt höchstens ein laufendes
  Training pro Nutzer.
- **Grenzen am iPhone:** Vibration gibt es im Browser nicht. Der Ton am Pausenende braucht eine
  geöffnete App; Benachrichtigungen im Hintergrund folgen in Phase 6.

## Ernährung (Phase 3)

- **Ziele:** `src/domain/nutrition/energy.ts`. Grundumsatz nach Mifflin-St-Jeor, mal
  Aktivitätsfaktor, plus Zuschlag fürs Krafttraining. Je nach Ziel −20 % (Fettabbau), −5 %
  (Rekomposition), ±0 (Halten) oder +10 % (Muskelaufbau). Das erste Ziel entsteht automatisch
  aus dem Fragebogen.
- **Adaptiver Verbrauch:** `src/domain/nutrition/adaptive.ts`. Verbrauch = durchschnittliche
  Zufuhr − Änderung des Gewichtstrends × 7700 kcal pro kg. Tage mit weniger als 800 kcal gelten
  als unvollständig und zählen nicht. Bei dünner Datenlage bleibt der Wert nahe an der Formel.
- **Lebensmittel:** drei Quellen.
  - 218 Grundnahrungsmittel im Code (`src/data/foods`). Die Werte sind übliche
    Durchschnittswerte, keine Laborwerte.
  - Open Food Facts für Markenprodukte. Gefundene Produkte werden in D1 gespeichert und stehen
    danach allen Nutzern ohne Netz zur Verfügung. An Open Food Facts gehen nur Suchbegriff
    oder Barcode.
  - Eigene Lebensmittel, nur für den jeweiligen Nutzer sichtbar.
- **Tagebuch:** Einträge speichern die Nährwerte als Momentaufnahme. Spätere Änderungen an
  einem Lebensmittel oder Rezept verändern alte Einträge nicht.
- **Barcode-Scan:** nutzt die Kamera über `@zxing/browser` (wird erst beim Öffnen geladen).
  Ohne Kamerafreigabe bleibt die Eingabe von Hand.

## Datenbank

Das Schema steht in `src/db/schema`. Nach einer Änderung:

```bash
npm run db:generate
```

```bash
npm run db:migrate
```

Läuft `npm run dev` gerade, danach neu starten: Der Entwicklungsserver übernimmt ein
geändertes Schema und neue Textdateien nicht zuverlässig im laufenden Betrieb.

## Deployment auf Cloudflare

**Produktion läuft** unter https://clickfit.online (erstes Deployment am 14.11.2026).
Datenbank `clickfit`, Bucket `clickfit-uploads` und das Secret `BETTER_AUTH_SECRET` sind
angelegt. Eine neue Version geht so live:

1. Neue Migrationen einspielen: `npm run db:migrate:prod`
2. Deployen: `npm run deploy`

Die Staging-Umgebung ist vorbereitet, aber noch nicht angelegt.

### Ersteinrichtung (zum Nachschlagen, für Produktion erledigt)

Im Cloudflare-Account, in dem die Zone `clickfit.online` liegt:

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
docs/                Spezifikation, Umsetzungsplan, Grafiken
drizzle/migrations/  SQL-Migrationen für D1
messages/de/         alle Texte der Oberfläche
scripts/             Seed, Icon-Erzeugung, Zeilenprüfung
src/app/             Seiten und API-Routen
src/components/      Layout, Formular-Bausteine, shadcn/ui
src/data/exercises/  Übungsbibliothek
src/data/foods/      Grundnahrungsmittel
src/db/              Drizzle-Schema und Client
src/domain/          reine Fachlogik ohne Framework (testbar)
src/features/        Fachbereiche: Dienste, Server Actions, Komponenten
src/lib/             Auth, Fehlercodes, Cloudflare-Kontext
src/sw/              Service Worker (wird nach public/sw.js gebaut)
tests/               Vitest-Tests
```
