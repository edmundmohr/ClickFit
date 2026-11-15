# ClickFit – Spezifikation

Stand: 2026-11-14. Dies ist die maßgebliche Anforderungsliste des Auftraggebers (zweite Fassung).
Die Umsetzungsreihenfolge steht in [ROADMAP.md](ROADMAP.md).

## Abweichungen von dieser Vorlage (mit dem Auftraggeber entschieden)

- **Name:** ClickFit (statt „FitForge“), Domain `clickfit.online`.
- **Hosting:** komplett auf Cloudflare (Workers + D1 + R2) statt Docker auf dem Heimserver.
- **ORM:** Drizzle statt Prisma (passt besser zu D1/Workers).
- **Auth:** Better Auth, Login per Benutzername. Keine Registrierung, keine Einladungen, keine
  E-Mail. Konten verwaltet der Admin in der App. Passwörter können geändert werden (selbst und
  durch den Admin).
- **Sprache:** Die App gibt es nur auf Deutsch (kein Englisch als zweite Sprache). Kommentare,
  Commit-Messages und Doku sind deutsch; Bezeichner und Dateinamen bleiben englisch.
  Damit gelten die Regeln 1 und 2 unten in dieser geänderten Form.
- **Darstellung:** Priorität hat die Nutzung auf dem iPhone.
- **Arbeitsweise:** selbstständige Planung und Umsetzung.

## Rolle & Ziel

Selbst gehostete Fitness-Web-App für den privaten Gebrauch (Auftraggeber + wenige
Familienmitglieder/Freunde). Vorbild ist die App „MCI – Personal Training AI“: ein
All-in-one-Begleiter für Krafttraining, Ernährung, Mobility und Cardio mit personalisierten
Plänen, die sich an den Fortschritt anpassen. Zusätzlich die Features aus deren öffentlicher
Roadmap. Kommerzielle Teile (Abo, Paywall, Testphase, menschliche Trainer, Discord,
Creator-Programm) werden nicht gebraucht.

## Verbindliche Regeln

1. Code komplett auf Englisch: Variablen, Funktionen, Kommentare, Commit-Messages, Dateinamen.
2. Keine hartcodierten UI-Texte. Jeder sichtbare Text läuft über das i18n-System (Schlüssel +
   Übersetzungsdateien). Standardsprache Deutsch, Englisch als zweite Sprache. Neue oder
   geänderte Texte werden automatisch in alle Sprachdateien eingetragen.
3. Dateigröße: Wird eine Quelldatei größer als 600 Zeilen, wird sie sinnvoll aufgeteilt.
4. Keine Änderungen an bestehenden Funktionen und keine UI-Änderungen ohne vorherige Absprache,
   sobald eine Phase abgenommen ist. Neue Ideen werden vorgeschlagen, nicht eigenmächtig umgesetzt.
5. Saubere Typisierung (TypeScript strict), keine `any`.
6. Pro Phase: Tests für die Kernlogik (Plan-Generator, Progression, Kalorienrechnung), eine
   aktuelle README und Seed-Daten.

## Technik (Vorgaben, soweit nicht oben abgewichen)

- Next.js (App Router) + TypeScript, Tailwind CSS, shadcn/ui
- i18n: next-intl (de / en)
- PWA: installierbar auf iPhone und Android, Service Worker, Offline-Training mit späterer
  Synchronisierung (IndexedDB-Queue)
- Charts: Recharts
- Responsive, Mobile-first, weil das Training am Handy stattfindet

## Nutzer

- Die App wird nur von Nutzern verwendet, die der Admin anlegt. Es gibt keine Registrierung,
  keine Einladungen und keine E-Mail; angemeldet wird per Benutzername. Diese Lösung bleibt
  unverändert.
- Der Admin kann unter **Mehr → Benutzer** Konten anlegen, Anzeigename, Benutzername und Rolle
  ändern, ein neues Passwort setzen und Konten mit allen Daten löschen. Das eigene Konto lässt
  sich dort weder löschen noch in der Rolle ändern; so bleibt immer ein Admin übrig.
- Jeder Nutzer hat seine eigenen Daten, Einstellungen (Sprache, Theme) und kann seine Daten
  exportieren (JSON/CSV).

## Funktionsumfang

### 1. Onboarding (Fragebogen)

- Ziel: Muskelaufbau / Fettabbau / Rekomposition / Fitness halten
- Trainingserfahrung: Anfänger / Fortgeschritten / Profi
- Verfügbare Trainingstage pro Woche und gewünschte Einheitendauer (z. B. 30/45/60/90 min)
- Trainingsort(e): Gym / Zuhause / unterwegs, mit verfügbarem Equipment
- Cardio gewünscht? (Art, Häufigkeit)
- Körperdaten: Geschlecht, Alter, Größe, Gewicht, Aktivitätslevel
- Optional: Verletzungen/Beschwerden, Übungen, die ausgeschlossen werden sollen
- Das Onboarding kann später jederzeit erneut durchlaufen werden
- Aufbau: Vollbild, eine Frage pro Bildschirm, drei Abschnitte (Profil, Ziele, Bedürfnisse).
  Zusätzlich: Körperfettanteil (vorgeschätzt), Trainingserfahrung in Monaten mit
  Selbsteinschätzung, bis zu zwei Schwerpunkt-Muskelgruppen, Belastung im Beruf

### 2. Personalisierte Trainingspläne

- Regelbasierter Plan-Generator (deterministisch, testbar): wählt Split (Ganzkörper, OK/UK,
  PPL …) passend zu Tagen, Dauer, Erfahrung, Ort und Equipment
- Automatische Progression: Gewichte und Wiederholungen werden anhand der geloggten Leistung
  angepasst (z. B. Double Progression, RPE/RIR-basiert); Deload-Wochen
- Pläne passen sich an, wenn sich Ziel, Tage oder Ort ändern
- Übungsbibliothek mit Seed-Daten (mind. ~150 Übungen): Name, Muskelgruppen (primär/sekundär),
  Equipment, Ort, Schwierigkeitsgrad, Anleitung, Alternativen
- Übungen tauschen (Alternativvorschläge mit gleichen Muskelgruppen)
- Optional später: LLM-gestützte Feinjustierung über eine austauschbare Provider-Schnittstelle
  (API-Key per Secret), aber ohne Pflicht. Die App muss voll ohne KI funktionieren.
  Wenn die KI genutzt wird, bezieht sie alle vorhandenen Daten der Person ein (Training,
  Ernährung, Körper, Erholung, Cardio, Gesundheitswerte), nie Name oder Benutzername.

### 3. Trainingsmodus (Workout-Screen)

- Satz für Satz loggen: Gewicht, Wiederholungen, optional RIR/RPE, Notiz
- Vorwerte der letzten Einheit anzeigen
- Pausentimer mit Ton am Ende (und Vibration, falls verfügbar)
- Live-Anzeige der Trainingsdauer: bisherige und voraussichtlich verbleibende Zeit
- Gewichte nachträglich ändern
- Offline-fähig, Sync bei Verbindung
- Bildschirm bleibt an (Wake Lock API)

### 4. Ernährung

- Tägliche Kalorien- und Makroempfehlung (Mifflin-St-Jeor + Aktivitätsfaktor + Zielanpassung),
  automatisch nachjustiert anhand des Gewichtsverlaufs
- Mahlzeiten-Tracking: Frühstück/Mittag/Abend/Snacks, schnelle Suche, zuletzt/häufig genutzte
  Lebensmittel
- Lebensmitteldatenbank: Import aus Open Food Facts (Suche + Barcode-Scan per Kamera);
  Ergebnisse lokal cachen
- Eigene Lebensmittel anlegen
- Rezepte anlegen und verwalten, Eintragen nach Portionen oder Gramm
- Ernährungsplan: Wochenplan aus Rezepten/Mahlzeiten, passend zum Kalorienziel
- Wassertracker (Tagesziel, Schnell-Buttons)
- Supplement-Tracker (Präparat, Dosis, Zeitpunkt, Häkchen pro Tag)

### 5. Fortschritt & Statistiken

- Körpergewicht (mit gleitendem Durchschnitt)
- Körperumfänge erfassen (Taille, Brust, Arme, Oberschenkel …)
- Kraftentwicklung pro Übung (geschätztes 1RM, Volumen)
- Muskelkarte: visuelle Körpersilhouette (SVG, vorne/hinten), die Trainingshäufigkeit, Sätze pro
  Woche und Erholungsstatus je Muskelgruppe einfärbt
- Fortschrittsfotos (privat, nur für den Nutzer)
- Optional in einer späteren Phase: Körperfett-Schätzung aus Fotos über den LLM-Provider, klar
  als grobe Schätzung gekennzeichnet

### 6. Gewohnheiten & Motivation

- Tägliche Streaks (Training, Ernährung geloggt, Wasser)
- Kalender: Monatsansicht mit geplanten und erledigten Einheiten, Ruhetage, Mahlzeiten-Logging
- Dashboard „Heute“: heutiges Training, Kalorien/Makros, Wasser, Streak

### 7. Flexibilität (Roadmap-Features)

- Mehrere Gym-Profile: verschiedene Trainingsorte mit eigenem Equipment, Plan passt sich je Ort an
- Flexibles Training für Gym, Zuhause und unterwegs
- Urlaubsmodus: Plan für Reisen/Hotelgym/Pause anpassen und danach sauber wieder einsteigen
- Zeitsparmodus: kürzere, effektive Variante einer Einheit (z. B. Supersätze, weniger Sätze)
- Übungen gezielt ausschließen
- Verletzungen, Schmerzen und Einschränkungen berücksichtigen, inkl. „Verletztenmodus“, der
  betroffene Bewegungsmuster meidet
- Eigenen Trainingsplan frei erstellen (Plan-Builder mit Drag & Drop)
- Pro Übung ein eigenes Zielgewicht festlegen; jede Änderung wird im Verlauf der Übung festgehalten
- Flexible Gewichtseingabe: eigene Gewichtsstufen pro Gerät/Hantel, freie Werte ohne Rundung,
  kg/lbs
- Cardio-Trainingsplan: Cardio im Onboarding wählbar, Einheiten (Dauer, Distanz, Puls-Zone,
  Intervalle) planen und loggen
- Flexibles Mobility-Training: eigenständige Mobility-Routinen, unabhängig vom Krafttraining,
  nach Körperregion/Beschwerde auswählbar
- Unterarm-/Griffkraft-Training als optionales Modul
- Sportartspezifische Pläne: Zusatzsportarten angeben (z. B. Radfahren, Laufen), Plan
  berücksichtigt Belastung und Erholung
- An den weiblichen Zyklus angepasstes Training (optional, nur wenn aktiviert)
- Dark Mode / Light Mode, standardmäßig nach Systemeinstellung
- Datenexport als CSV, Excel und PDF (Training, Gewicht, Ernährung)

### 8. Ergänzungen aus anderen Fitness-Apps (Hevy, Strong, Fitbod, Alpha Progression, MacroFactor, Stronglifts)

**Training & Logging**

- Aufwärm-Rechner: schlägt Aufwärmsätze mit steigendem Gewicht bis zum Arbeitsgewicht vor
- Scheiben-Rechner (Plate Calculator): zeigt, welche Scheiben pro Seite auf die Stange kommen;
  Stangengewicht und vorhandene Scheiben (inkl. Mini-Scheiben) pro Gym-Profil einstellbar
- Satz-Typen: Aufwärmsatz, Arbeitssatz, Satz bis zum Muskelversagen, Dropsatz; Aufwärmsätze
  zählen nicht ins Volumen
- Supersätze/Zirkel: Übungen gruppieren, Pausentimer greift erst nach der Gruppe
- Übungstypen: Gewicht × Wdh., Körpergewicht, Körpergewicht mit Zusatzgewicht, unterstütztes
  Körpergewicht (z. B. Klimmzug-Maschine), Dauer (Plank), Distanz/Zeit (Cardio)
- Eigene Übungen anlegen und bearbeiten (Muskelgruppen, Equipment, Typ, Notiz)
- Progressionsempfehlung pro Satz: Zielgewicht und Ziel-Wiederholungen für jeden einzelnen Satz,
  nicht nur pro Übung; generierte Pläne bleiben frei editierbar
- Lernender Generator: Der Plan-Generator bevorzugt Übungen, die häufig gemacht werden, und
  merkt sich, welche Vorschläge getauscht oder gelöscht werden
- Ein-Tipp-Logging: Satz mit einem Tipp als erledigt markieren (Vorwerte übernommen), große
  Touch-Ziele für verschwitzte Finger
- Pausentimer-Benachrichtigung, wenn die App im Hintergrund ist (Web Push, soweit Browser/iOS es
  erlauben; sonst Ton + Vibration im Vordergrund)
- Vergessene Workouts: Läuft ein Training ungewöhnlich lange (z. B. > 3 h), fragt die App nach
  und schlägt ein realistisches Ende vor
- Notizen pro Workout und pro Übung (z. B. Sitzeinstellung am Gerät), die beim nächsten Mal
  angezeigt werden
- Routinen in Ordnern organisieren

**Erholung**

- Muskel-Erholungsstatus pro Muskelgruppe (0–100 %), berechnet aus Volumen, Intensität und Zeit
  seit dem letzten Training; als Heatmap auf der Muskelkarte (vorne/hinten), Antippen zeigt die
  Historie der Muskelgruppe
- Cardio und Zusatzsport (auch importierte Aktivitäten) fließen in die Erholung ein
- Erholungsorientierter Modus: Alternative zum festen Split; die App wählt täglich die
  frischesten Muskelgruppen
- Erholungswerte manuell korrigierbar

**Fortschritt & Auswertung**

- Persönliche Rekorde (PRs): schwerstes Gewicht, bestes geschätztes 1RM, meiste Wiederholungen,
  höchstes Satz-Volumen, automatisch erkannt und im Workout hervorgehoben
- Workout-Zusammenfassung nach dem Training: Dauer, Volumen, Sätze, neue PRs
- Sätze pro Muskelgruppe pro Woche als Diagramm, Verteilung des Volumens auf Körperbereiche,
  meistgenutzte Übungen
- Kraftniveau-Einordnung für Kniebeuge, Bankdrücken, Kreuzheben (relativ zum Körpergewicht)
- Monatsbericht und Jahresrückblick
- Plateau-Erkennung: stagniert eine Übung über mehrere Wochen, schlägt die App Variation, Deload
  oder Volumenänderung vor
- Fortschrittsfotos auch direkt einem Workout zuordnen
- Einheiten kg/lbs auch gemischt (z. B. Kurzhanteln in lbs)

**Ernährung**

- Adaptiver Energieverbrauch (TDEE): Statt nur Formel wird der tatsächliche Verbrauch aus
  geloggter Kalorienzufuhr und Gewichtstrend berechnet (Zufuhr − Änderung der gespeicherten
  Energie = Verbrauch); robust gegen fehlende Tage und tägliche Gewichtsschwankungen
- Wöchentlicher Check-in: passt Kalorien- und Makroziele einmal pro Woche anhand des TDEE an,
  unabhängig davon, wie gut die Ziele getroffen wurden
- Gewichtstrend (geglättet) statt Tageswert als Hauptanzeige
- Eigene Lebensmittel wahlweise pro Portion, pro 100 g oder pro 100 ml definieren
- Mahlzeiten kopieren (z. B. „Frühstück von gestern“) und als Vorlage speichern

**Dashboard & Bedienung**

- Anpassbares Dashboard: Widgets ein-/ausblenden und sortieren
- Schnellzugriffs-Leiste für die häufigsten Aktionen (Training starten, Mahlzeit, Wasser,
  Gewicht)

### 9. Integrationen (spätere Phase)

- Health-Sync: authentifizierter Import-Endpoint (Webhook/REST mit API-Token pro Nutzer), z. B.
  für Apps wie „Health Auto Export“, sowie CSV-Import. Mapping für Gewicht, Schritte, Workouts
  und Ruhepuls.
- Optional: Home-Assistant-Anbindung über denselben API-Token (z. B. Gewicht von einer smarten
  Waage)

## Nicht umsetzen

Abo/Bezahlung/Testphase, menschliche Trainer-Chats, Discord, Challenges mit Preisen,
Creator-Programm, native Smartwatch-App, Social Feed/Follower/Leaderboards.
