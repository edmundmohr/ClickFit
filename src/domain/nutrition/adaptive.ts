/**
 * Gewichtstrend und adaptiver Energieverbrauch.
 * Der tatsächliche Verbrauch ergibt sich aus der Zufuhr und der Änderung der gespeicherten
 * Energie: Verbrauch = Zufuhr − Gewichtsänderung × Energiegehalt pro kg.
 */
import { addDays, diffDays, type LocalDate } from "@/lib/dates";
import { KCAL_PER_KG_BODY_WEIGHT } from "./energy";

export interface WeightPoint {
  date: LocalDate;
  weightKg: number;
}

export interface TrendPoint extends WeightPoint {
  trendKg: number;
}

/** Glättung pro Tag: Rund 10 % jeder neuen Messung fließen in den Trend ein. */
const DAILY_SMOOTHING = 0.1;

/**
 * Geglätteter Gewichtstrend (exponentielle Glättung). Lücken zwischen Messungen werden
 * berücksichtigt: Je länger die letzte Messung her ist, desto stärker zählt die neue.
 */
export function weightTrend(points: readonly WeightPoint[]): TrendPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const result: TrendPoint[] = [];
  let trend: number | null = null;
  let previousDate: LocalDate | null = null;
  for (const point of sorted) {
    if (trend === null || previousDate === null) {
      trend = point.weightKg;
    } else {
      const gapDays = Math.max(1, diffDays(previousDate, point.date));
      const weight = 1 - (1 - DAILY_SMOOTHING) ** gapDays;
      trend += weight * (point.weightKg - trend);
    }
    previousDate = point.date;
    result.push({ ...point, trendKg: trend });
  }
  return result;
}

export interface DailyIntake {
  date: LocalDate;
  kcal: number;
}

export interface AdaptiveTdeeInput {
  /** Tage mit geloggter Zufuhr im Betrachtungszeitraum. */
  intake: readonly DailyIntake[];
  /** Gewichtsmessungen; ausgewertet werden nur die im Zeitraum. */
  weights: readonly WeightPoint[];
  from: LocalDate;
  to: LocalDate;
  /** Schätzung aus der Formel; dient als Anker bei dünner Datenlage. */
  formulaTdeeKcal: number;
}

export interface AdaptiveTdeeResult {
  tdeeKcal: number;
  /** 0 = nur Formel, 1 = volle Datengrundlage. */
  confidence: number;
  /** Auswertbare Tage: Tage im Zeitraum mit mindestens `MIN_PLAUSIBLE_DAY_KCAL`. */
  loggedDays: number;
  avgIntakeKcal: number | null;
  /** Änderung des Gewichts im Zeitraum in kg (Ausgleichsgerade); `null` ohne ausreichende Messungen. */
  trendChangeKg: number | null;
}

/** Tage, an denen offensichtlich nur ein Bruchteil geloggt wurde, verfälschen den Schnitt. */
export const MIN_PLAUSIBLE_DAY_KCAL = 800;
const MIN_LOGGED_DAYS = 4;
const MIN_WEIGHT_POINTS = 3;
/** Die Messungen im Zeitraum müssen mindestens so viele Tage auseinanderliegen. */
const MIN_WEIGHT_SPAN_DAYS = 7;
const FULL_CONFIDENCE_DAYS = 14;
/** Der adaptive Wert darf höchstens so weit von der Formel abweichen. */
const MAX_DEVIATION = 0.35;

/**
 * Gewichtsänderung pro Tag als Steigung der Ausgleichsgeraden (kleinste Quadrate) durch die
 * Rohmessungen. Anders als der geglättete Trend hinkt die Gerade nicht nach und braucht
 * keinen Vorlauf vor dem Zeitraum: Bei gleichmäßiger Abnahme trifft sie die echte Rate.
 * `null`, wenn die Messungen keine Steigung hergeben.
 */
export function weightSlopePerDay(points: readonly WeightPoint[]): number | null {
  if (points.length < 2) return null;
  const origin = points[0].date;
  const xs = points.map((point) => diffDays(origin, point.date));
  const meanX = xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const meanY = points.reduce((sum, point) => sum + point.weightKg, 0) / points.length;
  let covariance = 0;
  let variance = 0;
  points.forEach((point, index) => {
    covariance += (xs[index] - meanX) * (point.weightKg - meanY);
    variance += (xs[index] - meanX) ** 2;
  });
  return variance > 0 ? covariance / variance : null;
}

export function adaptiveTdee(input: AdaptiveTdeeInput): AdaptiveTdeeResult {
  const windowDays = diffDays(input.from, input.to) + 1;
  const logged = input.intake.filter(
    (day) => day.date >= input.from && day.date <= input.to && day.kcal >= MIN_PLAUSIBLE_DAY_KCAL,
  );
  const avgIntakeKcal =
    logged.length > 0 ? logged.reduce((total, day) => total + day.kcal, 0) / logged.length : null;

  // Nur Messungen im Zeitraum: Zufuhr und Gewichtsänderung beziehen sich so auf dieselben Tage.
  const inWindow = [...input.weights]
    .filter((point) => point.date >= input.from && point.date <= input.to)
    .sort((a, b) => a.date.localeCompare(b.date));
  const spanDays = inWindow.length > 0 ? diffDays(inWindow[0].date, inWindow[inWindow.length - 1].date) : 0;
  const slope =
    inWindow.length >= MIN_WEIGHT_POINTS && spanDays >= MIN_WEIGHT_SPAN_DAYS ? weightSlopePerDay(inWindow) : null;
  const trendChangeKg = slope === null ? null : slope * (windowDays - 1);

  const fallback: AdaptiveTdeeResult = {
    tdeeKcal: Math.round(input.formulaTdeeKcal),
    confidence: 0,
    loggedDays: logged.length,
    avgIntakeKcal,
    trendChangeKg,
  };
  if (avgIntakeKcal === null || logged.length < MIN_LOGGED_DAYS || slope === null) {
    return fallback;
  }

  const storedEnergyPerDay = slope * KCAL_PER_KG_BODY_WEIGHT;
  const measured = avgIntakeKcal - storedEnergyPerDay;
  const lower = input.formulaTdeeKcal * (1 - MAX_DEVIATION);
  const upper = input.formulaTdeeKcal * (1 + MAX_DEVIATION);
  const clamped = Math.min(Math.max(measured, lower), upper);

  const coverage = Math.min(1, logged.length / windowDays);
  const duration = Math.min(1, windowDays / FULL_CONFIDENCE_DAYS);
  const confidence = coverage * duration;
  const tdeeKcal = input.formulaTdeeKcal + confidence * (clamped - input.formulaTdeeKcal);
  return { ...fallback, tdeeKcal: Math.round(tdeeKcal), confidence };
}

export interface TrendChange {
  /** Trend am Vergleichstag. */
  from: TrendPoint;
  /** Jüngster Trendwert. */
  to: TrendPoint;
  changeKg: number;
}

/**
 * Veränderung des Gewichtstrends über `days` Tage bis `today`. Als Vergleich dient die Messung,
 * die dem Tag `today − days` am nächsten liegt, höchstens `toleranceDays` davon entfernt; auch
 * der jüngste Wert darf höchstens so alt sein. Sonst `null`, denn dann ließe sich der Zeitraum
 * nicht ehrlich angeben.
 */
export function trendChangeOver(
  trend: readonly TrendPoint[],
  today: LocalDate,
  days: number,
  toleranceDays: number,
): TrendChange | null {
  const latest = trend.at(-1);
  if (!latest || diffDays(latest.date, today) > toleranceDays) return null;
  const target = addDays(today, -days);
  let best: TrendPoint | null = null;
  for (const point of trend) {
    const distance = Math.abs(diffDays(target, point.date));
    if (distance > toleranceDays || point.date >= latest.date) continue;
    if (!best || distance < Math.abs(diffDays(target, best.date))) best = point;
  }
  return best ? { from: best, to: latest, changeKg: latest.trendKg - best.trendKg } : null;
}

export const CHECK_IN_INTERVAL_DAYS = 7;
export const CHECK_IN_WINDOW_DAYS = 21;

/** Ein Check-in ist fällig, wenn das aktuelle Ziel mindestens eine Woche alt ist. */
export function isCheckInDue(targetStartDate: LocalDate, today: LocalDate): boolean {
  return diffDays(targetStartDate, today) >= CHECK_IN_INTERVAL_DAYS;
}
