import { isMeal, type AmountUnit, type Meal } from "@/domain/nutrition/types";
import { isValidLocalDate, type LocalDate } from "@/lib/dates";
import type { AddFoodInput } from "./schemas";

/** Wohin das gewählte Lebensmittel geht: Tagebuch, Rezept oder Wochenplan. */
export type AddTarget =
  | { target: "log"; date: LocalDate; meal: Meal }
  | { target: "recipe"; recipeId: string }
  | { target: "plan"; weekday: number; meal: Meal };

type Params = Record<string, string | string[] | undefined>;

const single = (value: string | string[] | undefined): string | undefined =>
  typeof value === "string" ? value : undefined;

/** Liest das Ziel aus den URL-Parametern; ohne gültige Angaben ist es das Tagebuch von heute. */
export function parseAddTarget(params: Params, today: LocalDate): AddTarget {
  const meal = single(params.meal);
  const safeMeal: Meal = isMeal(meal) ? meal : "snack";
  const target = single(params.target);
  const recipeId = single(params.recipeId);
  if (target === "recipe" && recipeId) return { target: "recipe", recipeId };
  const weekday = Number(single(params.weekday));
  if (target === "plan" && Number.isInteger(weekday) && weekday >= 1 && weekday <= 7) {
    return { target: "plan", weekday, meal: safeMeal };
  }
  const date = single(params.date);
  return { target: "log", date: date && isValidLocalDate(date) ? date : today, meal: safeMeal };
}

/** Seite, zu der es nach dem Eintragen zurückgeht. */
export function returnHref(target: AddTarget, today: LocalDate): string {
  if (target.target === "recipe") return `/nutrition/recipes/${target.recipeId}`;
  if (target.target === "plan") return `/nutrition/plan?day=${target.weekday}`;
  return target.date === today ? "/nutrition" : `/nutrition?date=${target.date}`;
}

/** Dieselben Angaben als URL-Parameter, z. B. für „Eigenes Lebensmittel anlegen“. */
export function targetQuery(target: AddTarget): string {
  const params = new URLSearchParams({ target: target.target });
  if (target.target === "recipe") params.set("recipeId", target.recipeId);
  if (target.target === "plan") params.set("weekday", String(target.weekday));
  if (target.target !== "recipe") params.set("meal", target.meal);
  if (target.target === "log") params.set("date", target.date);
  return params.toString();
}

export function toAddFoodInput(target: AddTarget, foodRef: string, amount: number, amountUnit: AmountUnit): AddFoodInput {
  return { ...target, foodRef, amount, amountUnit };
}
