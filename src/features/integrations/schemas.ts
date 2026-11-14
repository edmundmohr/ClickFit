import { z } from "zod";
import { CSV_KINDS } from "@/domain/health-import/types";
import { CSV_MAX_LENGTH, TOKEN_NAME_MAX_LENGTH } from "./constants";

export const tokenNameSchema = z.string().trim().min(1).max(TOKEN_NAME_MAX_LENGTH);
export const tokenIdSchema = z.string().min(1).max(64);

export const csvImportSchema = z.object({
  kind: z.enum(CSV_KINDS),
  text: z.string().min(1).max(CSV_MAX_LENGTH),
});
