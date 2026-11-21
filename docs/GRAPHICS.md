# Grafiken

Die Schmuckgrafiken unter `public/illustrations/` wurden mit der Antigravity-CLI (`agy`,
Gemini-Bildgenerator) erzeugt. Eingebunden werden sie über `src/components/illustration.tsx`.

| Datei | Motiv | Verwendung |
|---|---|---|
| `onboarding.jpg` | Klemmbrett, Hantel, Kalender | Einstieg in den Fragebogen |
| `nutrition.jpg` | Teller, Apfel, Trinkflasche, Waage | Platzhalter Ernährung |
| `progress.jpg` | Diagramm, Körperwaage, Maßband | Platzhalter Fortschritt |
| `rest-day.jpg` | Mond, Yogamatte, Faszienrolle, Tee | Ruhetag auf der Heute-Seite |
| `workout-done.jpg` | Pokal, Medaille, Langhantel | Zusammenfassung nach dem Training |
| `calendar.jpg` | Kalender mit Haken, Stoppuhr, Kettlebell | leerer Verlauf |

## Stil

Alle Bilder nutzen dieselbe Stilvorgabe, damit sie zusammenpassen:

> Minimalist flat vector illustration for a fitness app, 16:9 landscape, objects centred with
> generous empty space around them. Very dark near-black background (#0a0a0a), bright lime green
> (#a3e635) as the single accent colour, plus soft greys and white. Clean geometric shapes with
> subtle shading, standing on a faint dark floor line. No text, no letters, no numbers, no logos,
> no people.

## Neue Grafik erzeugen

```bash
agy -p "Generate one image with your image generation tool and name it <name>. Do not write code and do not draw it with Python or SVG; use real AI image generation. Motif: <Motiv>. <Stilvorgabe von oben>" --model gemini-3.8-flash-medium --print-timeout 240s
```

Die CLI legt das Bild unter `~/.gemini/antigravity-cli/brain/<Sitzung>/<name>_<Zeitstempel>.jpg`
ab (1376 × 768 px). Danach verkleinern und ins Projekt legen:

```bash
sips -Z 960 -s format jpeg -s formatOptions 72 <Quelle>.jpg --out public/illustrations/<name>.jpg
```

Zum Schluss den Namen in `ILLUSTRATIONS` in `src/components/illustration.tsx` eintragen.

An die CLI gehen nur die Bildbeschreibungen, keine Daten aus der App.

## Übungsillustrationen

Im Info-Dialog („i“ neben einer Übung) erscheint über der Kurzanleitung eine Illustration, wenn es
für die Übung eine abgenommene gibt. Die Bilder liegen unter `public/illustrations/exercises/<id>.jpg`
(960 × 716 px), die Liste der Übungen mit Bild steht in `src/data/exercises/illustrations.ts`.
`tests/domain/exercise-illustrations.test.ts` prüft, dass Liste und Dateien übereinstimmen.

Der Stil ist fest: eine gesichtslose, geschlechtsneutrale Figur in hellem Grauweiß mit dünnen
schwarzen Konturlinien, Geräte in Mittelgrau, die arbeitenden Muskeln als klare Flächen in
Limettengrün (#a3e635), fast schwarzer Hintergrund (#0a0a0a) mit dünner Bodenlinie, Format 4:3,
kein Text. Anders als bei den Schmuckgrafiken ist hier eine Person zu sehen.

### Erzeugen

- `scripts/illustrations/motifs.tsv`: eine Zeile pro Übung (Kennung, englische Bildbeschreibung
  mit Blickwinkel). Bisher die 78 Standardübungen (Priorität 1).
- `scripts/illustrations/generate.sh <Arbeitsordner> <motifs.tsv>`: ruft die Antigravity-CLI je
  Übung auf, legt das Ergebnis verkleinert in `out/<id>.jpg` ab, überspringt vorhandene Bilder und
  endet, sobald das Bild-Kontingent des Abos aufgebraucht ist.
- Im Arbeitsordner muss `style-reference.jpg` liegen (ein Bild im festen Stil). Ohne diese Vorlage
  driftet der Stil zwischen einzelnen Aufrufen, der Text allein reicht nicht.

Jedes Bild wird vor der Übernahme angesehen: Stil wie die Vorlage, Haltung und Gerät richtig,
Hände am Gerät, zwei Arme und zwei Beine. Falsche Bilder werden neu erzeugt, bei Bedarf mit
angepasster Bildbeschreibung. Erst abgenommene Bilder kommen nach `public/illustrations/exercises/`
und in die Liste.

Das Bild-Kontingent des Abos ist knapp (einige Bilder je Fünf-Stunden-Fenster, dazu eine Grenze
über mehrere Tage). Die Serie läuft deshalb in Etappen.
