/**
 * Gewichtstrend und adaptiver Energieverbrauch.
 * Der tatsächliche Verbrauch ergibt sich aus der Zufuhr und der Änderung der gespeicherten
 * Energie: Verbrauch = Zufuhr − Gewichtsänderung × Energiegehalt pro kg.
 */
import { diffDays, type LocalDate } from "@/lib/dates";
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
  /** Gewichtsmessungen (dürfen vor dem Zeitraum beginnen, das verbessert den Trend). */
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
  loggedDays: number;
  avgIntakeKcal: number | null;
  /** Änderung des Gewichtstrends im Zeitraum in kg; `null` ohne ausreichende Messungen. */
  trendChangeKg: number | null;
}

/** Tage, an denen offensichtlich nur ein Bruchteil geloggt wurde, verfälschen den Schnitt. */
const MIN_PLAUSIBLE_DAY_KCAL = 800;
const MIN_LOGGED_DAYS = 4;
const MIN_WEIGHT_POINTS = 3;
const FULL_CONFIDENCE_DAYS = 14;
/** Der adaptive Wert darf höchstens so weit von der Formel abweichen. */
const MAX_DEVIATION = 0.35;

export function adaptiveTdee(input: AdaptiveTdeeInput): AdaptiveTdeeResult {
  const windowDays = diffDays(input.from, input.to) + 1;
  const logged = input.intake.filter(
    (day) => day.date >= input.from && day.date <= input.to && day.kcal >= MIN_PLAUSIBLE_DAY_KCAL,
  );
  const avgIntakeKcal =
    logged.length > 0 ? logged.reduce((total, day) => total + day.kcal, 0) / logged.length : null;

  const trend = weightTrend(input.weights.filter((point) => point.date <= input.to));
  const inWindow = trend.filter((point) => point.date >= input.from);
  const start = trend.filter((point) => point.date <= input.from).at(-1) ?? inWindow[0];
  const end = trend.at(-1);
  const enoughWeights = inWindow.length >= MIN_WEIGHT_POINTS && start !== undefined && end !== undefined;
  const trendChangeKg = enoughWeights ? end.trendKg - start.trendKg : null;

  const fallback: AdaptiveTdeeResult = {
    tdeeKcal: Math.round(input.formulaTdeeKcal),
    confidence: 0,
    loggedDays: logged.length,
    avgIntakeKcal,
    trendChangeKg,
  };
  if (avgIntakeKcal === null || logged.length < MIN_LOGGED_DAYS || trendChangeKg === null || !start || !end) {
    return fallback;
  }

  const spanDays = Math.max(1, diffDays(start.date, end.date));
  const storedEnergyPerDay = (trendChangeKg * KCAL_PER_KG_BODY_WEIGHT) / spanDays;
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

export const CHECK_IN_INTERVAL_DAYS = 7;
export const CHECK_IN_WINDOW_DAYS = 21;

/** Ein Check-in ist fällig, wenn das aktuelle Ziel mindestens eine Woche alt ist. */
export function isCheckInDue(targetStartDate: LocalDate, today: LocalDate): boolean {
  return diffDays(targetStartDate, today) >= CHECK_IN_INTERVAL_DAYS;
}
