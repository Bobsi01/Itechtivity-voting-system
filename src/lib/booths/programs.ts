import { z } from "zod";

export const BOOTH_PROGRAM_CODES = ["BSCS", "BSEMC", "BSIT", "BSIS"] as const;
export const BoothProgramCodeSchema = z.enum(BOOTH_PROGRAM_CODES);
