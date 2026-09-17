// Zod for the founder execution fields (G14-S37) — the PATCH/POST body of
// /api/founder-profile carries them next to the legacy prose fields.
// Client-safe (no server-only): the founder profile form imports the enums
// and the same schema validates on both sides.

import { z } from "zod";
import {
  AMOUNT_BANDS,
  EMPTY_ROLES,
  EXECUTION_SOURCES,
  EXIT_TYPES,
  RAISE_ROUNDS,
  ROLE_KEYS,
  VALUE_BANDS,
  type FounderExecutionFields,
} from "@/lib/founder-profile-types";

export const MAX_EXITS = 10;
export const MAX_RAISES = 10;
const YEAR_MIN = 1970;
const YEAR_MAX = 2100;

const year = z.number().int().min(YEAR_MIN).max(YEAR_MAX).nullable();
const name = z.string().trim().min(1).max(120);

export const priorExitSchema = z
  .object({
    company: name,
    year,
    type: z.enum(EXIT_TYPES),
    value_band: z.enum(VALUE_BANDS).default("undisclosed"),
  })
  .strip();

export const priorRaiseSchema = z
  .object({
    company: name,
    round: z.enum(RAISE_ROUNDS),
    amount_aud_band: z.enum(AMOUNT_BANDS),
    year,
  })
  .strip();

const roleName = z.string().trim().max(120).nullable().transform((v) => (v && v.length ? v : null));

export const founderRolesSchema = z
  .object({
    ceo: roleName.default(null),
    cto: roleName.default(null),
    cpo: roleName.default(null),
    cfo: roleName.default(null),
  })
  .strip();

const GITHUB_URL_RE = /^https?:\/\/(www\.)?github\.com\/[A-Za-z0-9_.-]{1,39}(\/[A-Za-z0-9_.-]+)?\/?$/i;

export const githubUrlSchema = z
  .string()
  .trim()
  .max(300)
  .nullable()
  .transform((v) => (v && v.length ? v : null))
  .refine((v) => v == null || GITHUB_URL_RE.test(v), { message: "github_url must be a github.com user or repo URL" });

export const executionSourceMapSchema = z.record(z.string().max(40), z.enum(EXECUTION_SOURCES));

/** Every field optional — a legacy client that sends only prose fields still validates. */
export const founderExecutionInputSchema = z
  .object({
    prior_exits: z.array(priorExitSchema).max(MAX_EXITS).optional(),
    prior_raises: z.array(priorRaiseSchema).max(MAX_RAISES).optional(),
    github_url: githubUrlSchema.optional(),
    full_time_pct: z.number().int().min(0).max(100).nullable().optional(),
    worked_together_before: z.boolean().nullable().optional(),
    roles: founderRolesSchema.optional(),
    execution_source: executionSourceMapSchema.optional(),
  })
  .strip();

export type FounderExecutionInput = z.infer<typeof founderExecutionInputSchema>;

/** Parsed input → the full execution-field set (defaults for anything absent). */
export function executionFieldsFromInput(input: FounderExecutionInput): Omit<FounderExecutionFields, "execution_score" | "execution_computed_at"> {
  const roles = EMPTY_ROLES();
  if (input.roles) for (const k of ROLE_KEYS) roles[k] = input.roles[k] ?? null;
  return {
    prior_exits: input.prior_exits ?? [],
    prior_raises: input.prior_raises ?? [],
    github_url: input.github_url ?? null,
    full_time_pct: input.full_time_pct ?? null,
    worked_together_before: input.worked_together_before ?? null,
    roles,
    execution_source: input.execution_source ?? {},
  };
}
