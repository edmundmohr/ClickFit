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
| 6 | Offline & Export | fertig |
| 7 | Integrationen & optionale KI | fertig |

## Phase 1 – Fundament (fertig)

- Next.js auf Cloudflare Workers (OpenNext), D1 mit Drizzle, R2-Bucket vorbereitet
- Drei feste Nutzer, Login per Benutzername, Passwort ändern (selbst und durch den Admin)
- Nachtrag: Der Admin legt Benutzer in der App an, ändert und löscht sie (weiter ohne E-Mail)
- i18n-System (nur Deutsch), Dark/Light nach Systemeinstellung, Einheiten kg/lbs als Einstellung
- Layout mit Navigation, auf das iPhone ausgerichtet
- PWA-Grundgerüst: Manifest, Icons, Service Worker mit Offline-Seite
- Datenexport (JSON) als Grundgerüst

## Phase 2 – Training-Kern (fertig)

- Übungsbibliothek mit 232 Übungen im Code (`src/data/exercises`): Muskelgruppen, Equipment,
  Schwierigkeit, Anleitung, Alternativen; Suche und Filter
- Übungstypen: Gewicht × Wdh., Körpergewicht (auch mit Zusatzgewicht oder unterstützt), Dauer
- Fragebogen, jederzeit wiederholbar (ursprünglich sieben Schritte, später neu aufgebaut, siehe unten)
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

## Phase 6 – Offline & Export (fertig)

- Offline-Training: Sätze, Notiz und Beenden werden auf dem Gerät gespeichert (IndexedDB) und
  später übertragen; jeder Vorgang wird auf dem Server höchstens einmal ausgeführt
- Zuletzt gesehene Seiten bleiben ohne Netz abrufbar; das laufende Training übersteht ein
  Neuladen ohne Verbindung
- Pausen-Benachrichtigung per Web Push, wenn die App im Hintergrund ist
- Export von Training, Gewicht und Ernährung als CSV, Excel und PDF

Grenzen:

- Offline funktioniert das laufende Training. Ein Training starten und alle anderen Bereiche
  (Ernährung, Gewicht, Cardio, Mobility, Einstellungen) brauchen eine Verbindung.
- Web Push am iPhone gibt es nur in der installierten App (ab iOS 16.4) nach erteilter
  Erlaubnis. Geplant wird die Benachrichtigung in dem Moment, in dem die App in den
  Hintergrund geht; ohne Verbindung in diesem Moment bleibt sie aus.
- Vibration gibt es am iPhone im Browser weiterhin nicht.

## Phase 7 – Integrationen & optionale KI (fertig)

- Health-Import-API mit API-Token pro Nutzer: Gewicht, Schritte, Ruhepuls und Workouts, im
  Format von „Health Auto Export“ oder als einfaches JSON
- Home-Assistant-Anbindung über denselben Token (z. B. Gewicht von einer smarten Waage)
- CSV-Import für Gewicht, Schritte, Ruhepuls und Aktivitäten
- Importierte Workouts fließen in die Erholung ein; Schritte und Ruhepuls erscheinen unter
  Fortschritt
- Austauschbare KI-Schnittstelle mit Anthropic als Anbieter; alles funktioniert auch ohne KI
- Plan-Feinschliff per KI: Vorschläge werden geprüft und nur nach Auswahl übernommen
- Körperfett-Schätzung aus Fotos, klar als grobe Schätzung gekennzeichnet
- Zustimmung pro Konto und Tageslimit für KI-Anfragen
- JSON-Export enthält jetzt alle gespeicherten Daten

Grenzen:

- Das Format von „Health Auto Export“ ist nach dessen Dokumentation umgesetzt und nicht gegen
  die echte App geprüft.
- Die Körperfett-Schätzung ist eine Einschätzung nach Augenschein und kann deutlich
  danebenliegen. Das Modell kann eine Schätzung auch ablehnen.
- Schritte und Ruhepuls werden angezeigt, fließen aber nicht in Kalorienziel oder Erholung ein.

## Erweiterungen nach Phase 7

- Fokus-Training: eine einzelne Einheit für ausgewählte Körperregionen und eine wählbare Dauer
  (20–90 Minuten), unabhängig vom Wochenplan; zeigt die Erholung je Region an.
- Abfrage nach jeder Übung: Anstrengung und RIR nach dem letzten Satz, freiwillig und
  abschaltbar; fließt in die Progression und in „Plan verfeinern“ ein.
- Mehrere Trainingspläne: beliebig viele benannte Pläne (z. B. Sommer, Winter, Draußen) mit
  Hauptplan, Zusatzplänen, inaktiven Plänen und Archiv. Zusatzpläne erscheinen zusätzlich an
  ihren Wochentagen, sodass auch zwei Einheiten am Tag geplant sind (z. B. morgens draußen,
  abends zu Hause). Optional fester Ort pro Plan. Migration 0009 (nur Daten: bestehende Pläne
  ohne festen Ort). Die Verwaltung liegt hinter „Pläne verwalten“ auf der Plan-Seite (kein
  eigener Tab): eine Übersicht nach „In deiner Woche“ und „Nicht eingeplant“ und eine eigene
  Seite pro Plan mit Routinen, Einplanung, Ort und Archivieren.
- Gewichtsverlauf erweitert: Zeitraum wählbar (1, 3, 6 Monate, 1 Jahr, alles), Liste der
  Messungen mit Ändern und Löschen (mit Rückgängig), Nachtragen für frühere Tage. Der Trend
  läuft immer über alle Messungen und wird nur für die Anzeige auf den Zeitraum begrenzt.
  Keine Migration.
- KI mit allen Daten: Plan verfeinern und Körperfett-Schätzung beziehen jetzt alle
  gespeicherten Daten ein (Training mit Notizen, Erholung, Ernährung, Gewicht, Umfänge, Cardio,
  Mobility, Schritte, Ruhepuls, Zyklus, Beschwerden). Neu ist die KI-Auswertung unter
  Fortschritt → Berichte: Einschätzung je Bereich, Empfehlungen und optional die Antwort auf
  eine Frage. Die bestehende Zustimmung gilt weiter; die Liste der gesendeten Daten in den
  Einstellungen ist angepasst. Migration 0010 (Tabelle `ai_review`).
- Eigenes Zielgewicht pro Übung im Routine-Editor: gilt fürs nächste Training, danach steigert
  die Progression wieder automatisch. Jede Änderung steht im Verlauf der Übung unter
  Fortschritt → Kraft und im Export. Migration 0011 (Spalten in `plan_exercise`, Tabelle
  `target_weight_change`).
- Fragebogen neu aufgebaut nach dem Vorbild eines geführten Einstiegs: Vollbild, eine Frage pro
  Bildschirm, drei Abschnitte mit geteilter Fortschrittsleiste, schlicht in Schwarz-Weiß. Neu abgefragt
  werden Körperfettanteil (vorgeschätzt aus Größe, Gewicht, Alter), Trainingserfahrung in
  Monaten mit Selbsteinschätzung in sechs Stufen, bis zu zwei Schwerpunkt-Muskelgruppen (ein
  Satz mehr, wenn die Zeit reicht) und die körperliche Belastung im Beruf. Trainingstage werden
  als Anzahl gewählt (mit Empfehlung) und in der Wochenplanung verschoben. Migration 0012
  (Spalten in `user_profile`).
- Optionales Mobility-Warm-up im laufenden Training: passend zu den Körperbereichen der Übungen
  des Tages, etwa fünf Minuten, startbar oder überspringbar, ohne Eintrag im Mobility-Protokoll.
