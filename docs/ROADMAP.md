# ClickFit – Umsetzungsplan

Die Anforderungen stehen in [SPEC.md](SPEC.md). Dieser Plan ordnet sie den Phasen zu,
einschließlich der Ergänzungen aus Abschnitt 8.

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Fundament | fertig |
| 2 | Training-Kern | fertig |
| 3 | Ernährung | fertig |
| 4 | Fortschritt & Dashboard | fertig |
| 5 | Flexibilität | fertig |
| 6 | Offline & Export | offen |
| 7 | Integrationen & optionale KI | offen |

## Phase 1 – Fundament (fertig)

- Next.js auf Cloudflare Workers (OpenNext), D1 mit Drizzle, R2-Bucket vorbereitet
- Drei feste Nutzer, Login per Benutzername, Passwort ändern (selbst und durch den Admin)
- i18n-System (nur Deutsch), Dark/Light nach Systemeinstellung, Einheiten kg/lbs als Einstellung
- Layout mit Navigation, auf das iPhone ausgerichtet
- PWA-Grundgerüst: Manifest, Icons, Service Worker mit Offline-Seite
- Datenexport (JSON) als Grundgerüst

## Phase 2 – Training-Kern (fertig)

- Übungsbibliothek mit 232 Übungen im Code (`src/data/exercises`): Muskelgruppen, Equipment,
  Schwierigkeit, Anleitung, Alternativen; Suche und Filter
- Übungstypen: Gewicht × Wdh., Körpergewicht (auch mit Zusatzgewicht oder unterstützt), Dauer
- Fragebogen in sieben Schritten, jederzeit wiederholbar
- Plan-Generator (deterministisch): Split nach Trainingstagen, Übungsauswahl nach Equipment,
  Erfahrung, Dauer, Ausschlüssen und Beschwerden
- Trainingsmodus: Satz-Logging mit RIR und Notiz, Vorwerte, Ein-Tipp-Logging, Pausentimer mit
  Ton/Vibration, Live-Dauer und Restzeit, Wake Lock, nachträgliches Ändern
- Satz-Typen (Aufwärmen, Arbeit, Muskelversagen, Dropsatz), Aufwärm-Rechner
- Progression pro Satz (Double Progression mit RIR), Deload-Wochen
- Notizen pro Workout, pro Übung (erscheint bei jedem Training) und pro Satz
- Persönliche Rekorde (im Training markiert), Workout-Zusammenfassung
- Nachfrage bei vergessenen Workouts (länger als drei Stunden)
- Übungen im Plan tauschen, Plan neu erstellen
- Verlauf, Kalender (Monatsansicht), Trainings-Streak, Heute-Seite
- Sechs Schmuckgrafiken (siehe [GRAPHICS.md](GRAPHICS.md))

Aus Phase 2 verschoben und inzwischen umgesetzt: eigene Übungen, Supersätze/Zirkel und
Cardio-Logging (Phase 5), Mahlzeiten im Kalender (Phase 3).

## Phase 3 – Ernährung (fertig)

- Kalorien- und Makroziele: Mifflin-St-Jeor, Aktivitätsfaktor, Zuschlag fürs Krafttraining,
  Anpassung an das Ziel; manuell überschreibbar
- Adaptiver Energieverbrauch aus Zufuhr und geglättetem Gewichtstrend, wöchentlicher Check-in
  mit Vorschlag für neue Ziele
- Tagebuch mit vier Mahlzeiten, Menge ändern, Mahlzeit von gestern kopieren, Mahlzeit als
  Rezept speichern
- Lebensmittel: 218 eingebaute Grundnahrungsmittel, Open Food Facts (Suche und Barcode, lokal
  zwischengespeichert), eigene Lebensmittel (pro 100 g, 100 ml oder Portion)
- Suche mit „Zuletzt“ und „Häufig“, Barcode-Scan per Kamera mit Eingabe von Hand als Rückfall
- Rezepte mit Portionen, Eintragen nach Portionen oder Gramm
- Wochenplan je Wochentag mit Vergleich zum Kalorienziel, Übernahme ins Tagebuch
- Wassertracker, Supplement-Tracker, Körpergewicht mit Trend
- Heute-Seite mit Kalorien, Makros, Wasser und Streaks; Kalender markiert Tage mit Einträgen

Hinweis: Der Check-in schlägt neue Ziele vor und wendet sie erst nach einem Tipp an. Die
Gewichtskurve als Diagramm folgt in Phase 4.

## Phase 4 – Fortschritt & Dashboard (fertig)

- Körpergewicht als Diagramm mit geglättetem Trend, Körperumfänge mit Verlauf
- Kraftentwicklung pro Übung (geschätztes 1RM, Volumen), persönliche Rekorde
- Kraftniveau für Kniebeuge, Bankdrücken und Kreuzheben relativ zum Körpergewicht
- Plateau-Erkennung mit Vorschlag (Deload, mehr Volumen oder Variation)
- Muskelkarte (vorne/hinten) mit Erholung, Sätzen pro Woche und Häufigkeit; Verlauf je
  Muskelgruppe; Erholung von Hand korrigierbar
- Verteilung der Sätze auf Körperbereiche, meistgenutzte Übungen
- Fortschrittsfotos im privaten R2-Bucket, auch einem Training zuordenbar
- Monatsbericht und Jahresrückblick
- Heute-Seite mit frei anordenbaren Kacheln und Schnellzugriff

Cardio und Zusatzsport fließen seit Phase 5 in die Erholung ein.

## Phase 5 – Flexibilität (fertig)

- Trainingsorte (Gym-Profile) mit eigenem Equipment, Stange, Scheiben und Gewichtsstufen;
  der Plan passt sich an den aktiven Ort an, ohne den gespeicherten Plan zu ändern
- Scheiben-Rechner im Trainingsmodus
- Flexible Gewichte: eigene Stufen oder feste Gewichtslisten je Gerät, freie Werte beim Loggen,
  kg und lbs gemischt (z. B. Kurzhanteln in lbs, Stange in kg)
- Urlaubsmodus (Pause oder Training unterwegs) mit leichterem Wiedereinstieg nach längerer Pause
- Zeitsparmodus: Kurzvariante jeder Einheit
- Übungen ausschließen, Verletztenmodus (Beschwerden ohne Fragebogen ändern)
- Plan-Builder mit Drag & Drop, Routinen in Ordnern, eigene Übungen
- Supersätze und Zirkel (Pause erst nach dem Durchgang)
- Lernender Generator (merkt sich getauschte und gelöschte Vorschläge, bevorzugt oft Gemachtes)
- Erholungsorientierter Modus: täglicher Vorschlag aus den frischesten Muskelgruppen
- Cardio-Plan und -Logging mit Puls-Zonen und Intervallen; Zusatzsport
- Cardio und Zusatzsport fließen in die Erholung ein
- 17 Mobility-Routinen mit 60 Übungen, nach Körperregion und Beschwerde, mit geführtem Ablauf
- Griffkraft-Modul, zyklusangepasstes Training (beides abschaltbar)

Hinweise:

- Der erholungsorientierte Modus ergänzt den Wochenplan um einen täglichen Vorschlag; der
  Wochenplan bleibt daneben bestehen.
- Der Zusatzsport wirkt auf zwei Wegen: über geloggte Einheiten auf die Erholung und – ab drei
  beinlastigen Einheiten pro Woche – über einen Satz weniger bei Bein-Isolationsübungen im
  nächsten erzeugten Plan.
- Der Verletztenmodus meidet Bewegungsmuster je Körperregion nach einer festen Zuordnung
  (`PATTERNS_TO_AVOID`); er ersetzt keine ärztliche Beratung.

## Phase 6 – Offline & Export

- Vollständige Offline-Synchronisierung (IndexedDB-Queue)
- Pausentimer-Benachrichtigung im Hintergrund (Web Push, soweit iOS es erlaubt)
- Export als CSV, Excel und PDF (Training, Gewicht, Ernährung)

## Phase 7 – Integrationen & optionale KI

- Health-Import-API mit API-Token pro Nutzer, CSV-Import
- Home-Assistant-Anbindung (z. B. smarte Waage)
- LLM-Provider-Schnittstelle: Feinjustierung der Pläne, Körperfett-Schätzung aus Fotos
