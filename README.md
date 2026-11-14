# ClickFit

Private Fitness-Web-App für Krafttraining, Ernährung, Mobility und Cardio.
Läuft komplett auf Cloudflare (Workers, D1, R2) unter `clickfit.online`.

- Anforderungen: [docs/SPEC.md](docs/SPEC.md)
- Umsetzungsplan und Stand: [docs/ROADMAP.md](docs/ROADMAP.md)

**Stand:** Alle sieben Phasen sind fertig (Fundament, Training-Kern, Ernährung, Fortschritt,
Flexibilität, Offline & Export, Integrationen & optionale KI).

## Technik

| Bereich | Lösung |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript strict, Tailwind CSS 4, shadcn/ui |
| Hosting | Cloudflare Workers über `@opennextjs/cloudflare` |
| Datenbank | Cloudflare D1 (SQLite) mit Drizzle ORM |
| Dateien | Cloudflare R2 (privater Bucket, ab Phase 4 genutzt) |
| Anmeldung | Better Auth, Login per Benutzername, Sessions in der Datenbank |
| Texte | next-intl, nur Deutsch, alle Texte in `messages/de/*.json` |
| Drag & Drop | `@dnd-kit` im Plan-Builder (Touch, Maus und Tastatur) |
| Offline | Service Worker (Seiten-Cache) und Warteschlange in IndexedDB, Übertragung über `/api/sync` |
| Web Push | VAPID mit Web Crypto, zeitversetzte Zustellung über Cloudflare Queues |
| Export | CSV, Excel (`fflate`) und PDF (`pdf-lib`) |
| KI (optional) | Anthropic über `@anthropic-ai/sdk`, hinter einer austauschbaren Schnittstelle (`src/lib/llm`) |
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

Für die Pausen-Benachrichtigung braucht es zusätzlich den privaten Push-Schlüssel. Das Skript
schreibt ihn selbst in `.dev.vars` und zeigt nur den öffentlichen Schlüssel an:

```bash
npx tsx scripts/generate-vapid-keys.ts
```

Der öffentliche Schlüssel steht in `wrangler.jsonc` (`vars.VAPID_PUBLIC_KEY`). Ein neues Paar
macht alle bestehenden Push-Abos ungültig; das Skript erzeugt deshalb nur dann eines, wenn noch
keines da ist.

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

Soll die Vorschau neben einem laufenden `npm run dev` laufen, braucht sie einen eigenen Port.
Dabei ist `--local-upstream` wichtig, sonst schreibt Wrangler die Herkunft der Anfragen auf die
Produktions-Domain um und die Anmeldung schlägt fehl:

```bash
npx wrangler dev --port 3100 --local-upstream localhost:3100 --var APP_URL:http://localhost:3100
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
| `npm run test` | Tests (Rechte, Anmeldung, Plan-Generator, Progression, Rekorde, Streaks, Kalorien und Makros, adaptiver Verbrauch, Erholung, Gewichtsstufen und Scheiben, Plan-Anpassung, Supersätze, Cardio, Mobility sowie alle Dienste gegen die lokale D1) |

In `.next/types` tauchten beim Entwickeln Kopien wie `routes.d 2.ts` auf (vermutlich durch die
Ordner-Synchronisierung von macOS). `tsconfig.json` schließt solche Dateien aus, damit die
Typprüfung nicht an ihnen scheitert.

## Training (Phase 2)

- **Übungsbibliothek:** 232 Übungen liegen als Daten im Code (`src/data/exercises`). Sie brauchen
  keinen Seed und keine Migration. Trainingsdaten verweisen über die Kennung der Übung darauf.
- **Ausführungshinweise:** Jede eingebaute Übung hat neben der Anleitung 2–4 typische Fehler
  (`mistakes`, Format „Fehler – Korrektur“) und 2–4 Kurzbefehle (`cues`, höchstens etwa fünf
  Wörter). Die Übungsseite zeigt sie als eigene Abschnitte, im Trainingsmodus öffnet das
  Info-Symbol sie als Dialog, ohne das Training zu verlassen. Eigene Übungen haben keine.
  `tests/domain/exercise-catalog.test.ts` prüft Anzahl, Format und Dubletten.
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

## Fortschritt (Phase 4)

- **Erholung:** `src/domain/progress/recovery.ts`. Jede Einheit erzeugt je Muskelgruppe Ermüdung
  aus der Zahl der Sätze und ihrer Härte (RIR). Zehn harte Sätze gelten als volle Erschöpfung.
  Die Ermüdung klingt linear ab, je nach Umfang über ein bis drei Tage. Ein von Hand gesetzter
  Wert ersetzt die Berechnung bis zum nächsten Training.
- **Kraftniveau:** `src/domain/progress/strength.ts`. Grobe Richtwerte aus dem Verhältnis von
  geschätztem 1RM zu Körpergewicht, keine Wettkampfnormen.
- **Plateau:** Sind die letzten drei Einheiten einer Übung über mindestens drei Wochen nicht
  besser als die drei davor, gibt es einen Hinweis mit Vorschlag.
- **Diagramme:** Recharts über `src/components/charts/series-chart.tsx`. Eine Achse pro
  Diagramm, geprüfte Farben (`--viz-*` in `globals.css`), Tooltip und eine Tabelle für
  Screenreader.
- **Fotos:** Upload über `POST /api/photos`, Auslieferung über `GET /api/photos/<id>` nur an
  den Besitzer. Bilder werden vor dem Upload im Browser auf 1600 px verkleinert. Erlaubt sind
  JPEG, PNG und WebP bis 8 MB.
- **Heute-Seite:** Reihenfolge und Sichtbarkeit der Kacheln unter `/dashboard`.

## Flexibilität (Phase 5)

- **Trainingsorte:** unter `/training/gyms`. Jeder Ort hat eigenes Equipment, optional eine
  eigene Stange mit Scheiben und eigene Gewichtsstufen je Gerät. Genau ein Ort ist aktiv.
- **Plan passt sich an, ohne sich zu ändern:** `src/domain/training/adaptation.ts`. Übungen,
  die am aktiven Ort nicht gehen, ausgeschlossen sind oder ein Bewegungsmuster einer
  angegebenen Beschwerde nutzen, werden in der Anzeige und beim Start durch die beste
  Alternative ersetzt. Der gespeicherte Plan bleibt, wie er ist; nach dem Wechsel zurück ins
  Studio steht wieder der ursprüngliche Plan da.
- **Gewichte:** `src/domain/training/weights.ts`. Gespeichert wird immer in kg. Je Gerät lässt
  sich Einheit (kg oder lbs), Sprung oder eine feste Liste vorhandener Gewichte festlegen; die
  Progression schlägt dann die nächste vorhandene Stufe vor. Beim Loggen ist jeder Wert
  erlaubt. Der Scheiben-Rechner probiert alle Kombinationen der vorhandenen Scheiben durch.
- **Pläne und Routinen:** Ein Plan (`training_plan`) enthält Routinen (`plan_day`). Unter
  `/training/routines` (Tab „Pläne“) lassen sich beliebig viele Pläne anlegen, z. B. „Sommer“,
  „Winter“, „Draußen“. Jeder Plan hat eine Rolle (`status`, Regeln in
  `src/domain/training/plan-roles.ts`): genau ein **Hauptplan** (`active`), beliebig viele
  **Zusatzpläne** (`extra`), **inaktive** Pläne (`saved`) und das **Archiv** (`archived`).
  Haupt- und Zusatzpläne sind eingeplant: Ihre Routinen mit festem Wochentag stehen auf der
  Heute-Seite, im Kalender und zählen für die Serie. So geht z. B. morgens eine Einheit aus
  „Draußen“ und abends eine aus dem Hauptplan; die Heute-Kachel hakt jede einzeln ab. Der
  Hauptplan lässt sich nicht archivieren oder löschen, erst ein anderer Plan muss ihn ablösen.
  Ein neu eingeplanter Plan beginnt am Tag des Wechsels (Kalender, Deload-Wochen). Endgültig
  löschen geht nur im Archiv; „Plan neu erstellen“ legt den bisherigen erzeugten Plan dort ab.
  Der Builder unter `/training/routines/<id>` speichert eine Routine immer vollständig.
- **Fester Ort pro Plan:** Optional hat ein Plan einen festen Trainingsort
  (`training_plan.gym_profile_id`). Seine Routinen nutzen dann beim Start, in der Anzeige und
  beim Tauschen das Equipment und die Gewichtsstufen dieses Orts, unabhängig vom aktiven Ort
  (`withPlanGym` in `context-service.ts`). Ohne festen Ort gilt der Ort des Tages (im
  Reise-Urlaub der Reiseort). Migration 0009 setzt den Ort aller bestehenden Pläne auf „kein
  fester Ort“, damit sich für sie nichts ändert.
- **Supersätze und Zirkel:** Übungen mit gleicher `group_id`. Die Pause startet erst, wenn alle
  Übungen der Gruppe den Durchgang haben (`src/domain/training/supersets.ts`).
- **Eigene Übungen:** Tabelle `custom_exercise`, Kennung beginnt mit `custom-`. Gelöschte
  Übungen werden nur archiviert, damit der Verlauf vollständig bleibt.
- **Lernender Generator:** Tauschen im erzeugten Plan und Löschen im Builder zählen als
  Ablehnung (`exercise_preference`); die Nutzung kommt aus dem Verlauf der letzten 90 Tage.
  Der Generator bleibt deterministisch.
- **Anpassungen:** unter `/training/adjustments`: Verletztenmodus,
  Urlaubsmodus (Pause oder Training unterwegs), erholungsorientierter Modus, Griffkraft-Modul,
  Zusatzsport und zyklusangepasstes Training.
- **Fokus-Training:** unter `/training/focus` (Knopf auf der Plan-Seite). Man wählt eine oder
  mehrere Körperregionen (Brust, Rücken, Schultern, Arme, Bauch, Po, Beine) und eine Dauer; die
  App stellt daraus eine einzelne Einheit zusammen (`src/domain/training/focus-day.ts`). Die
  Regionen kommen im Wechsel dran, damit bei wenig Zeit jede mindestens eine Übung bekommt;
  Grundübungen stehen vorne. Equipment des aktiven Orts, Ausschlüsse, Beschwerden und gelernte
  Vorlieben gelten wie im Hauptplan. Die Einheit ändert den Plan nicht und läuft im Verlauf
  als „Fokus: …“.
- **Abfrage nach jeder Übung:** Sind alle Arbeitssätze einer Übung abgehakt, fragt der
  Trainingsmodus freiwillig nach der Anstrengung (leicht, passend, schwer, am Limit) und dem RIR
  (0 bis 4+). Gespeichert wird beides an der Übung im Training (`workout_exercise.effort`,
  `effort_rir`), auch offline über die Warteschlange (`exercise.feedback`). Steht beim letzten
  Satz kein RIR, nutzt die Progression den RIR aus der Abfrage (`withExerciseRir`). Abschalten
  lässt sich die Abfrage unter Anpassungen → Trainingsmodi.
- **Zeitsparmodus:** „Kurz“ auf der Plan-Karte startet eine Variante mit einem Satz weniger,
  Supersätzen aus benachbarten Isolationsübungen und ohne die letzten Übungen.
- **Wiedereinstieg:** Nach mehr als zehn Tagen ohne Training beginnen die Zielgewichte bei
  90 %, nach drei Wochen bei 85 %, nach sechs Wochen bei 75 %.
- **Cardio und Zusatzsport:** `src/domain/cardio`, Seite `/training/cardio`. Geloggte Einheiten
  werden in Muskelbelastung umgerechnet und fließen in die Erholung ein. Die Puls-Zonen
  beruhen auf der Formel nach Tanaka (208 − 0,7 × Alter) und sind Richtwerte.
- **Mobility:** 60 Übungen und 17 Routinen liegen als Daten im Code (`src/data/mobility`) und
  brauchen keinen Seed. Der geführte Ablauf läuft unter `/training/mobility/<id>`.
- **Zyklus:** Die Phase wird rein nach Kalender aus dem letzten Periodenbeginn geschätzt. Die
  Angaben lassen sich jederzeit samt Abschalten löschen.

## Offline & Export (Phase 6)

- **Was offline geht:** das laufende Training. Sätze, Löschen von Sätzen, die Notiz zur
  Einheit und das Beenden landen zuerst in einer Warteschlange auf dem Gerät (IndexedDB,
  `src/lib/offline`) und werden über `POST /api/sync` übertragen, sobald Verbindung besteht.
  Jeder Vorgang hat eine Kennung; der Server führt ihn höchstens einmal aus
  (`sync_operation`). Abgehakt und beendet wird mit der Zeit auf dem Gerät.
- **Was eine Verbindung braucht:** ein Training starten, Ernährung, Gewicht, Cardio, Mobility
  und alle Einstellungen.
- **Seiten ohne Netz:** Der Service Worker (`src/sw/sw.ts`) merkt sich zuletzt geladene Seiten
  und zeigt ohne Netz den zuletzt gesehenen Stand, sonst die Offline-Seite. Das laufende
  Training, die Heute-Seite und der Plan werden dafür gezielt vorgemerkt. Beim Abmelden werden
  die gemerkten Seiten gelöscht.
- **Pausen-Benachrichtigung:** unter **Mehr → Einstellungen** je Gerät einschalten. Geht die
  App während einer Pause in den Hintergrund, meldet sie dem Server das Ende der Pause; der
  legt eine Nachricht mit passender Verzögerung in die Queue `clickfit-rest-timer`. Der
  Verbraucher läuft im Worker-Einstieg `worker.ts` und schickt den Push nur, wenn die Pause
  noch gilt. Kommt die App vorher zurück, wird die Benachrichtigung abgesagt.
  - Der Push hat keinen Inhalt; den Text zeigt der Service Worker selbst. So muss nichts
    verschlüsselt werden und es verlässt kein Trainingsinhalt den Server.
  - Push-Endpunkte werden nur für die Dienste von Apple, Google, Mozilla und Microsoft
    angenommen.
  - **iPhone:** Web Push gibt es nur in der zum Home-Bildschirm hinzugefügten App (ab
    iOS 16.4) und erst nach der Erlaubnis. Die Benachrichtigung kann nur geplant werden, wenn
    das iPhone beim Wechsel in den Hintergrund Verbindung hat.
- **Export:** unter **Mehr → Daten exportieren** (`/export`). Training, Gewicht und Ernährung
  als CSV, Excel oder PDF über `GET /api/export/<datensatz>?format=…&from=…&to=…`. Die CSV nutzt
  Semikolon und Dezimalkomma, damit deutsches Excel sie direkt richtig öffnet; Textzellen, die
  wie eine Formel beginnen, werden entschärft. Der JSON-Vollexport bleibt unter
  `/api/me/export`.

## Integrationen & KI (Phase 7)

- **Health-Import:** `POST /api/import/health` mit `Authorization: Bearer <Token>`. Tokens legt
  jeder Nutzer unter **Mehr → Integrationen** an; gespeichert wird nur ihr SHA-256-Hash, der
  Token selbst ist nur beim Anlegen sichtbar. Angenommen werden das Format der iOS-App
  „Health Auto Export“ und ein einfaches eigenes JSON-Format (Gewicht, Schritte, Ruhepuls,
  Workouts). Krafttraining aus der Health-App wird nicht übernommen, weil es in ClickFit selbst
  geloggt wird. Ein von Hand eingetragenes Gewicht wird vom Import nicht überschrieben.
- **Home Assistant:** nutzt denselben Endpunkt und Token, z. B. `{ "weight": 81.2 }` von einer
  smarten Waage. Ein Beispiel für `rest_command` und Automation steht auf der Seite
  Integrationen.
- **CSV-Import:** auf derselben Seite für Gewicht, Schritte, Ruhepuls und Aktivitäten. Die von
  ClickFit exportierte Gewichts-CSV lässt sich wieder einlesen.
- **KI ist freiwillig:** Ohne das Secret `ANTHROPIC_API_KEY` sind alle KI-Funktionen
  ausgeblendet, die App funktioniert vollständig ohne. Jeder Nutzer muss sie zusätzlich unter
  **Mehr → Einstellungen** für sein Konto einschalten; dort steht, was gesendet wird. Pro Nutzer
  sind 20 Anfragen am Tag möglich.
- **Plan verfeinern:** Auf der Plan-Seite beschreibt man einen Wunsch. Das Modell schlägt
  Änderungen vor (tauschen, hinzufügen, entfernen, Sätze und Wiederholungen anpassen). Die App
  prüft jeden Vorschlag (`src/domain/ai/plan-changes.ts`): nur Übungen aus dem Katalog, die zu
  Equipment, Beschwerden und Ausschlüssen passen; übernommen wird nur, was man auswählt.
  Gesendet werden Ziel, Erfahrung, Trainingstage, Equipment, Beschwerden, der Plan, die
  Rückmeldungen nach Übungen der letzten vier Wochen (Datum, Anstrengung, RIR; siehe
  `src/domain/ai/feedback-summary.ts`) und der Wunsch – kein Name, keine Gewichte oder
  Wiederholungen aus dem Verlauf.
- **Körperfett-Schätzung:** im Foto-Dialog unter Fortschritt → Fotos, nach einer Rückfrage vor
  jedem Foto. Gespeichert wird eine Spanne von mindestens drei Prozentpunkten, überall als grobe
  Schätzung gekennzeichnet. Reicht das Foto nicht aus, gibt es keine Schätzung.
- **Modell:** Standard ist `claude-opus-5-5` mit strukturierter Ausgabe. Lehnt das Modell eine
  Anfrage ab, darf der Anbieter sie auf einem Ausweich-Modell wiederholen. Über die Variable
  `LLM_MODEL` lässt sich ein anderes Modell wählen. Ein anderer Anbieter braucht nur eine neue
  Umsetzung von `LlmProvider`.
- **JSON-Export:** `/api/me/export` enthält seit dieser Phase alle gespeicherten Daten des
  Nutzers, ohne Zugangsdaten und ohne die Bilddateien der Fotos.

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

Seit Phase 6 braucht der Worker zusätzlich die Queue `clickfit-rest-timer`
(`npx wrangler queues create clickfit-rest-timer`) und das Secret `VAPID_PRIVATE_KEY`
(`npx wrangler secret put VAPID_PRIVATE_KEY`, Wert aus `.dev.vars`). Beides muss vor dem
ersten Deployment mit Phase 6 vorhanden sein.

Für die KI-Funktionen kommt optional das Secret `ANTHROPIC_API_KEY` dazu
(`npx wrangler secret put ANTHROPIC_API_KEY`). Wichtig: als **Secret** anlegen, nicht als
Text-Variable – Text-Variablen, die nicht in `wrangler.jsonc` stehen, löscht jedes Deployment.

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
