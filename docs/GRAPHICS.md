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
