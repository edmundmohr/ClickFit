/**
 * Alle gespeicherten Daten einer Person als kompakter Text für die KI. Jede Funktion bekommt
 * die Abschnitte, die für ihre Aufgabe zählen. Name und Benutzername kommen hier nie vor.
 * Reine Funktionen ohne Framework; das Laden übernimmt `features/ai/services/data-snapshot.ts`.
 */
import type { TrendPoint } from "@/domain/nutrition/adaptive";
import type { Muscle } from "@/domain/exercises/types";
import { startOfWeek, type LocalDate } from "@/lib/dates";
import type { DatedValue, ExerciseProgress, WeekSummary } from "./data-summary";

/** Ausgewerteter Zeitraum für Training, Ernährung, Cardio und Gesundheitswerte. */
export const AI_LOOKBACK_DAYS = 56;
/** Längerer Zeitraum für das Körpergewicht, damit der Verlauf erkennbar ist. */
export const AI_WEIGHT_LOOKBACK_DAYS = 182;
/** Obergrenzen, damit die Anfrage überschaubar bleibt. */
export const AI_MAX_EXERCISES = 30;
export const AI_MAX_SESSIONS = 40;
export const AI_MAX_NOTES = 20;
export const AI_MAX_ACTIVITIES = 40;

export interface AiProfileData {
  sex: string;
  ageYears: number;
  heightCm: number;
  goal: string;
  experience: string;
  activityLevel: string;
  trainingWeekdays: number;
  sessionMinutes: number;
  injuries: string[];
  injuryNote: string | null;
  cardioWish: { wanted: boolean; types: string[]; sessionsPerWeek: number };
  excludedExercises: string[];
}

export interface AiSettingsData {
  recoveryMode: boolean;
  gripModule: boolean;
  vacation: { type: string; from: LocalDate; until: LocalDate } | null;
  /** Geschätzte Zyklusphase heute, wenn das zyklusangepasste Training an ist. */
  cycle: { day: number; phase: string; lengthDays: number } | null;
  extraSports: { type: string; sessionsPerWeek: number }[];
}

export interface AiSessionData {
  date: LocalDate;
  name: string | null;
  durationMinutes: number | null;
  isDeload: boolean;
  isShort: boolean;
  note: string | null;
}

export interface AiNoteData {
  date: LocalDate | null;
  exercise: string;
  note: string;
}

export interface AiTrainingData {
  sessions: AiSessionData[];
  exercises: ExerciseProgress[];
  weeklySets: Partial<Record<Muscle, number>>;
  /** Dauerhafte Notizen je Übung (z. B. Sitzeinstellung, Schmerzen). */
  exerciseNotes: AiNoteData[];
  /** Notizen an einzelnen Sätzen, neueste zuerst. */
  setNotes: AiNoteData[];
  /** Plan-Routinen mit Wochentag (1 = Montag); `null` = ohne festen Tag. */
  plan: { name: string; weekday: number | null; exercises: string[] }[];
}

export interface AiNutritionData {
  target: { kcal: number; proteinG: number; carbsG: number; fatG: number; source: string } | null;
  /** Geschätzter Verbrauch aus Zufuhr und Gewichtstrend. */
  adaptive: { tdeeKcal: number; confidence: number } | null;
  kcal: WeekSummary[];
  proteinG: WeekSummary[];
  carbsG: WeekSummary[];
  fatG: WeekSummary[];
  waterMl: WeekSummary[];
  waterGoalMl: number | null;
  supplements: { name: string; dose: string | null; takenDays: number }[];
}

export interface AiBodyData {
  weights: TrendPoint[];
  measurements: { site: string; first: DatedValue; last: DatedValue }[];
  bodyFat: { date: LocalDate; lowPercent: number; highPercent: number }[];
  photos: number;
}

export interface AiCardioData {
  activities: {
    date: LocalDate;
    type: string;
    minutes: number;
    distanceKm: number | null;
    avgHeartRate: number | null;
    zone: number | null;
    intensity: string;
    note: string | null;
  }[];
  planned: { weekday: number; type: string; minutes: number; zone: number | null }[];
}

export interface AiDataSnapshot {
  today: LocalDate;
  /** Erster Tag des Zeitraums für Training, Ernährung, Cardio und Gesundheitswerte. */
  from: LocalDate;
  profile: AiProfileData | null;
  settings: AiSettingsData;
  training: AiTrainingData;
  /** Erholung je Muskelgruppe in Prozent (100 = erholt). */
  recovery: Partial<Record<Muscle, number>>;
  nutrition: AiNutritionData;
  body: AiBodyData;
  cardio: AiCardioData;
  mobility: { date: LocalDate; routine: string; minutes: number }[];
  steps: WeekSummary[];
  restingHeartRate: WeekSummary[];
}

export const AI_SECTIONS = [
  "profile",
  "settings",
  "training",
  "recovery",
  "nutrition",
  "body",
  "cardio",
  "mobility",
  "health",
] as const;
export type AiSection = (typeof AI_SECTIONS)[number];

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits;
  return String(Math.round(value * factor) / factor);
};
const kg = (value: number | null) => (value === null ? "–" : `${round(value)} kg`);
const none = "keine";
const list = (lines: string[]) => (lines.length > 0 ? lines.join("\n") : none);
/** Freitext aus der App: einzeilig und gekürzt, damit er die Struktur nicht sprengt. */
const quote = (text: string, max = 200) => `"${text.replace(/\s+/g, " ").trim().slice(0, max)}"`;

function weeks(label: string, summaries: readonly WeekSummary[], unit: string, digits = 0): string {
  if (summaries.length === 0) return `${label}: keine Einträge`;
  const lines = summaries.map(
    (week) => `- Woche ab ${week.weekStart}: Ø ${round(week.average, digits)} ${unit} (${week.days} Tage)`,
  );
  return `${label}:\n${lines.join("\n")}`;
}

const SEX_WORDS: Record<string, string> = { female: "weiblich", male: "männlich" };

function formatProfile(profile: AiProfileData | null): string {
  if (!profile) return "Profil: noch nicht ausgefüllt.";
  return [
    `Profil: ${SEX_WORDS[profile.sex] ?? profile.sex}, etwa ${profile.ageYears} Jahre, ${round(profile.heightCm, 0)} cm.`,
    `Ziel: ${profile.goal}. Erfahrung: ${profile.experience}. Alltagsaktivität: ${profile.activityLevel}.`,
    `Geplant: ${profile.trainingWeekdays} Krafttrainings pro Woche à ${profile.sessionMinutes} Minuten.`,
    `Cardio-Wunsch: ${profile.cardioWish.wanted ? `${profile.cardioWish.sessionsPerWeek}× pro Woche (${profile.cardioWish.types.join(", ") || "ohne Vorgabe"})` : "kein"}.`,
    `Beschwerden (Körperregionen): ${profile.injuries.join(", ") || none}.`,
    `Beschwerden (eigene Beschreibung): ${profile.injuryNote ? quote(profile.injuryNote, 500) : none}.`,
    `Ausgeschlossene Übungen: ${profile.excludedExercises.join(", ") || none}.`,
  ].join("\n");
}

function formatSettings(settings: AiSettingsData): string {
  const vacation = settings.vacation
    ? `${settings.vacation.type === "pause" ? "Trainingspause" : "Training unterwegs"} vom ${settings.vacation.from} bis ${settings.vacation.until}`
    : none;
  const cycle = settings.cycle
    ? `Tag ${settings.cycle.day} von etwa ${settings.cycle.lengthDays}, geschätzte Phase: ${settings.cycle.phase}`
    : "nicht erfasst";
  const sports = settings.extraSports.map((sport) => `${sport.type} ${sport.sessionsPerWeek}× pro Woche`);
  return [
    `Einstellungen: Erholungsmodus ${settings.recoveryMode ? "an" : "aus"}, Griffkraft-Modul ${settings.gripModule ? "an" : "aus"}.`,
    `Urlaub/Pause: ${vacation}.`,
    `Zyklus: ${cycle}.`,
    `Regelmäßiger Zusatzsport: ${sports.join(", ") || none}.`,
  ].join("\n");
}

function bestSet(set: ExerciseProgress["first"]): string {
  if (set.assistanceKg !== null) return `${set.date} Unterstützung ${kg(set.assistanceKg)} × ${set.reps}`;
  const weight = set.weightKg === null ? `${set.reps} Wdh.` : `${kg(set.weightKg)} × ${set.reps}`;
  return `${set.date} ${weight}${set.oneRepMaxKg === null ? "" : ` (1RM ≈ ${kg(set.oneRepMaxKg)})`}`;
}

function formatTraining(training: AiTrainingData, from: LocalDate): string {
  const sessions = training.sessions.map((session) => {
    const flags = [session.isDeload ? "Deload" : null, session.isShort ? "Kurzvariante" : null].filter(Boolean);
    const duration = session.durationMinutes === null ? "" : `, ${session.durationMinutes} min`;
    const note = session.note ? `, Notiz: ${quote(session.note)}` : "";
    return `- ${session.date} ${session.name ?? "Training"}${duration}${flags.length > 0 ? ` (${flags.join(", ")})` : ""}${note}`;
  });
  const exercises = training.exercises.map((item) => {
    const plateau = item.plateauDays === null ? "" : `, seit ${item.plateauDays} Tagen keine Steigerung`;
    const rir = item.avgRir === null ? "" : `, Ø RIR ${round(item.avgRir)}`;
    return `- ${item.name}: ${item.sessions} Einheiten, ${item.sets} Sätze; erste: ${bestSet(item.first)}; letzte: ${bestSet(item.last)}${rir}${plateau}`;
  });
  const muscles = Object.entries(training.weeklySets).map(([muscle, sets]) => `${muscle} ${sets}`);
  const plan = training.plan.map(
    (day) => `- ${day.name}${day.weekday === null ? "" : ` (Wochentag ${day.weekday})`}: ${day.exercises.join(", ") || "leer"}`,
  );
  const notes = training.exerciseNotes.map((note) => `- ${note.exercise}: ${quote(note.note)}`);
  const setNotes = training.setNotes.map((note) => `- ${note.date ?? ""} ${note.exercise}: ${quote(note.note)}`);
  return [
    `Krafttraining seit ${from} (${training.sessions.length} abgeschlossene Einheiten):\n${list(sessions)}`,
    `Fortschritt je Übung (bester Satz der ersten und der letzten Einheit im Zeitraum):\n${list(exercises)}`,
    `Arbeitssätze pro Woche je Muskelgruppe (Durchschnitt): ${muscles.join(", ") || none}`,
    `Aktueller Hauptplan:\n${list(plan)}`,
    `Dauerhafte Notizen zu Übungen:\n${list(notes)}`,
    `Notizen an Sätzen:\n${list(setNotes)}`,
  ].join("\n\n");
}

function formatRecovery(recovery: Partial<Record<Muscle, number>>): string {
  const entries = Object.entries(recovery).map(([muscle, percent]) => `${muscle} ${Math.round(percent)} %`);
  return `Erholung heute je Muskelgruppe (100 % = erholt): ${entries.join(", ") || "keine Angaben"}`;
}

function formatNutrition(nutrition: AiNutritionData): string {
  const target = nutrition.target
    ? `${nutrition.target.kcal} kcal, ${nutrition.target.proteinG} g Eiweiß, ${nutrition.target.carbsG} g Kohlenhydrate, ${nutrition.target.fatG} g Fett (Quelle: ${nutrition.target.source})`
    : "keins";
  const adaptive = nutrition.adaptive
    ? `${nutrition.adaptive.tdeeKcal} kcal (Sicherheit ${Math.round(nutrition.adaptive.confidence * 100)} %)`
    : "nicht berechenbar";
  const supplements = nutrition.supplements.map(
    (item) => `- ${item.name}${item.dose ? ` (${item.dose})` : ""}: an ${item.takenDays} Tagen genommen`,
  );
  return [
    `Ernährungsziel: ${target}.`,
    `Geschätzter Verbrauch aus Zufuhr und Gewichtstrend: ${adaptive}.`,
    weeks("Kalorien pro Tag mit Einträgen", nutrition.kcal, "kcal"),
    weeks("Eiweiß", nutrition.proteinG, "g"),
    weeks("Kohlenhydrate", nutrition.carbsG, "g"),
    weeks("Fett", nutrition.fatG, "g"),
    weeks(`Wasser (Ziel ${nutrition.waterGoalMl === null ? "nicht gesetzt" : `${nutrition.waterGoalMl} ml`})`, nutrition.waterMl, "ml"),
    `Supplements:\n${list(supplements)}`,
  ].join("\n");
}

/** Gewicht: eine Zeile pro Woche (letzter Messwert und Trend der Woche). */
function formatWeights(weights: readonly TrendPoint[]): string {
  if (weights.length === 0) return "Körpergewicht: keine Messungen";
  const byWeek = new Map<LocalDate, TrendPoint>();
  for (const point of weights) byWeek.set(startOfWeek(point.date), point);
  const lines = [...byWeek.values()].map(
    (point) => `- ${point.date}: Messwert ${kg(point.weightKg)}, Trend ${kg(point.trendKg)}`,
  );
  return `Körpergewicht (letzte Messung jeder Woche, Trend geglättet; ${weights.length} Messungen insgesamt):\n${lines.join("\n")}`;
}

function formatBody(body: AiBodyData): string {
  const measurements = body.measurements.map(
    (item) =>
      `- ${item.site}: ${round(item.first.value)} cm am ${item.first.date} → ${round(item.last.value)} cm am ${item.last.date}`,
  );
  const bodyFat = body.bodyFat.map((item) => `- ${item.date}: ${round(item.lowPercent, 0)}–${round(item.highPercent, 0)} %`);
  return [
    formatWeights(body.weights),
    `Körperumfänge (erste und letzte Messung):\n${list(measurements)}`,
    `Frühere Körperfett-Schätzungen der KI aus Fotos (grob):\n${list(bodyFat)}`,
    `Fortschrittsfotos gespeichert: ${body.photos}`,
  ].join("\n\n");
}

function formatCardio(cardio: AiCardioData): string {
  const activities = cardio.activities.map((item) => {
    const details = [
      `${item.minutes} min`,
      item.distanceKm === null ? null : `${round(item.distanceKm)} km`,
      item.avgHeartRate === null ? null : `Ø Puls ${item.avgHeartRate}`,
      item.zone === null ? null : `Zone ${item.zone}`,
      `Anstrengung ${item.intensity}`,
      item.note ? `Notiz: ${quote(item.note)}` : null,
    ].filter(Boolean);
    return `- ${item.date} ${item.type}: ${details.join(", ")}`;
  });
  const planned = cardio.planned.map(
    (item) => `- Wochentag ${item.weekday}: ${item.type} ${item.minutes} min${item.zone === null ? "" : `, Zone ${item.zone}`}`,
  );
  return [`Cardio und Sport (neueste zuerst):\n${list(activities)}`, `Geplante Cardio-Einheiten:\n${list(planned)}`].join("\n\n");
}

function formatMobility(mobility: AiDataSnapshot["mobility"]): string {
  const lines = mobility.map((item) => `- ${item.date} ${item.routine} (${item.minutes} min)`);
  return `Mobility-Routinen:\n${list(lines)}`;
}

function formatHealth(snapshot: AiDataSnapshot): string {
  return [weeks("Schritte pro Tag", snapshot.steps, "Schritte"), weeks("Ruhepuls", snapshot.restingHeartRate, "bpm")].join("\n");
}

/**
 * Text mit den gewünschten Abschnitten in fester Reihenfolge. Fehlende Daten stehen als
 * „keine“ darin, damit die KI Lücken als solche erkennt und nicht rät.
 */
export function formatDataContext(snapshot: AiDataSnapshot, sections: readonly AiSection[] = AI_SECTIONS): string {
  const wanted = new Set(sections);
  const parts: string[] = [`Heute ist ${snapshot.today}. Zeitraum der Auswertung: ${snapshot.from} bis ${snapshot.today}.`];
  if (wanted.has("profile")) parts.push(formatProfile(snapshot.profile));
  if (wanted.has("settings")) parts.push(formatSettings(snapshot.settings));
  if (wanted.has("training")) parts.push(formatTraining(snapshot.training, snapshot.from));
  if (wanted.has("recovery")) parts.push(formatRecovery(snapshot.recovery));
  if (wanted.has("nutrition")) parts.push(formatNutrition(snapshot.nutrition));
  if (wanted.has("body")) parts.push(formatBody(snapshot.body));
  if (wanted.has("cardio")) parts.push(formatCardio(snapshot.cardio));
  if (wanted.has("mobility")) parts.push(formatMobility(snapshot.mobility));
  if (wanted.has("health")) parts.push(formatHealth(snapshot));
  return parts.join("\n\n");
}
