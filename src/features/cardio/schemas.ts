import { z } from "zod";
import { ACTIVITY_TYPES, CARDIO_ACTIVITY_TYPES, INTENSITIES } from "@/domain/cardio/types";
import { isValidLocalDate } from "@/lib/dates";

export const idSchema = z.string().min(1).max(64);

const zoneSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]);
const noteSchema = z.string().trim().max(500).nullable();

export const intervalSchema = z.object({
  workSeconds: z.number().int().min(5).max(3600),
  restSeconds: z.number().int().min(0).max(3600),
  repeats: z.number().int().min(1).max(100),
});

/** Geloggte Einheit: Cardio oder Zusatzsport. */
export const activitySchema = z.object({
  date: z.string().refine(isValidLocalDate),
  type: z.enum(ACTIVITY_TYPES),
  durationSeconds: z.number().int().min(60).max(86_400),
  distanceMeters: z.number().positive().max(1_000_000).nullable(),
  avgHeartRate: z.number().int().min(30).max(250).nullable(),
  zone: zoneSchema.nullable(),
  intensity: z.enum(INTENSITIES),
  intervals: intervalSchema.nullable(),
  note: noteSchema,
});
export type ActivityInput = z.infer<typeof activitySchema>;

/** Geplante Cardio-Einheit an einem Wochentag. Zusatzsport wird nicht geplant. */
export const cardioPlanEntrySchema = z.object({
  weekday: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]),
  type: z.enum(CARDIO_ACTIVITY_TYPES),
  minutes: z.number().int().min(1).max(600),
  zone: zoneSchema.nullable(),
  intervals: intervalSchema.nullable(),
  note: noteSchema,
});
export type CardioPlanEntryInput = z.infer<typeof cardioPlanEntrySchema>;

/** Mit `id` wird ein bestehender Eintrag geändert, ohne `id` ein neuer angelegt. */
export const saveCardioPlanEntrySchema = cardioPlanEntrySchema.extend({ id: idSchema.optional() });
