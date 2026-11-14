# ClickFit – Umsetzungsplan

Die Anforderungen stehen in [SPEC.md](SPEC.md). Dieser Plan ordnet sie den Phasen zu,
einschließlich der Ergänzungen aus Abschnitt 8.

| Phase | Inhalt | Stand |
|---|---|---|
| 1 | Fundament | fertig |
| 2 | Training-Kern | offen |
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

## Phase 2 – Training-Kern

- Übungsbibliothek (mind. 150 Übungen) mit Muskelgruppen, Equipment, Ort, Schwierigkeit,
  Anleitung, Alternativen
- Übungstypen: Gewicht × Wdh., Körpergewicht (auch mit Zusatzgewicht oder unterstützt), Dauer,
  Distanz/Zeit
- Eigene Übungen anlegen und bearbeiten
- Onboarding-Fragebogen, jederzeit wiederholbar
- Plan-Generator (deterministisch): Split nach Tagen, Dauer, Erfahrung, Ort, Equipment
- Trainingsmodus: Satz-Logging mit RIR/RPE und Notiz, Vorwerte, Ein-Tipp-Logging, Pausentimer mit
  Ton/Vibration, Live-Dauer, Wake Lock, Gewichte nachträglich ändern
- Satz-Typen (Aufwärmen, Arbeit, Muskelversagen, Dropsatz), Supersätze/Zirkel
- Aufwärm-Rechner
- Progression pro Satz (Double Progression, RIR-basiert), Deload-Wochen
- Notizen pro Workout und pro Übung, die beim nächsten Mal erscheinen
- Persönliche Rekorde, Workout-Zusammenfassung, Nachfrage bei vergessenen Workouts
- Übungen tauschen
- Kalender (Monatsansicht) und Streaks
- Dashboard „Heute“ mit dem heutigen Training

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
- Freier Plan-Builder mit Drag & Drop, Routinen in Ordnern
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
