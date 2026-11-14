# ClickFit – Umsetzungsplan

Die Anforderungen stehen in [SPEC.md](SPEC.md). Dieser Plan ordnet sie den Phasen zu,
einschließlich der Ergänzungen aus Abschnitt 8.

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Fundament | fertig |
| 2 | Training-Kern | fertig |
| 3 | Ernährung | offen |
| 4 | Fortschritt & Dashboard | offen |
| 5 | Flexibilität | offen |
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

Aus Phase 2 verschoben:

- Eigene Übungen anlegen und bearbeiten → Phase 5 (zusammen mit dem Plan-Builder)
- Supersätze/Zirkel → Phase 5 (zusammen mit dem Zeitsparmodus)
- Cardio-Einheiten loggen (Distanz/Zeit) → Phase 5 (Cardio-Plan); die Übungen stehen schon
  in der Bibliothek
- Mahlzeiten im Kalender → Phase 3

## Phase 3 – Ernährung

- Kalorien- und Makroempfehlung (Mifflin-St-Jeor, Aktivitätsfaktor, Zielanpassung)
- Adaptiver Energieverbrauch (TDEE) aus Zufuhr und Gewichtstrend, wöchentlicher Check-in
- Mahlzeiten-Tracking mit Suche, zuletzt/häufig genutzt, Mahlzeiten kopieren und Vorlagen
- Open Food Facts (Suche, Barcode-Scan), lokaler Cache
- Eigene Lebensmittel (pro Portion, 100 g oder 100 ml), Rezepte (Portion/Gramm)
- Ernährungsplan (Wochenplan), Wassertracker, Supplement-Tracker

## Phase 4 – Fortschritt & Dashboard

- Körpergewicht mit geglättetem Trend, Körperumfänge
- Kraftentwicklung pro Übung (geschätztes 1RM, Volumen), Rekord-Übersicht
- Muskelkarte (SVG vorne/hinten) mit Sätzen pro Woche und Erholungsstatus (0–100 %),
  Historie je Muskelgruppe, Erholung manuell korrigierbar
- Auswertungen: Sätze pro Muskelgruppe pro Woche, Volumenverteilung, meistgenutzte Übungen,
  Kraftniveau-Einordnung, Plateau-Erkennung, Monatsbericht, Jahresrückblick
- Fortschrittsfotos in R2 (privat), auch einem Workout zuordenbar
- Anpassbares Dashboard (Widgets) und Schnellzugriffs-Leiste

## Phase 5 – Flexibilität

- Gym-Profile mit eigenem Equipment, Stangengewicht und Scheiben; Scheiben-Rechner
- Flexible Gewichtseingabe: eigene Gewichtsstufen, freie Werte, kg/lbs auch gemischt
- Urlaubsmodus, Zeitsparmodus, Übungen ausschließen, Verletztenmodus
- Freier Plan-Builder mit Drag & Drop, Routinen in Ordnern, eigene Übungen
- Supersätze/Zirkel (Pausentimer greift erst nach der Gruppe)
- Lernender Generator (bevorzugt häufige Übungen, merkt sich getauschte/gelöschte Vorschläge)
- Erholungsorientierter Modus als Alternative zum festen Split
- Cardio-Plan und -Logging, Mobility-Routinen, Griffkraft-Modul
- Zusatzsportarten (fließen in die Erholung ein), zyklusangepasstes Training (optional)

## Phase 6 – Offline & Export

- Vollständige Offline-Synchronisierung (IndexedDB-Queue)
- Pausentimer-Benachrichtigung im Hintergrund (Web Push, soweit iOS es erlaubt)
- Export als CSV, Excel und PDF (Training, Gewicht, Ernährung)

## Phase 7 – Integrationen & optionale KI

- Health-Import-API mit API-Token pro Nutzer, CSV-Import
- Home-Assistant-Anbindung (z. B. smarte Waage)
- LLM-Provider-Schnittstelle: Feinjustierung der Pläne, Körperfett-Schätzung aus Fotos
