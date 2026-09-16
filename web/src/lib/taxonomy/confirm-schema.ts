// Zod body for PATCH /api/projects/[id]/taxonomy (G13-W4-D2 E1.4). Pure —
// shared by the route and its tests; the store re-validates independently.

import { z } from "zod";
import { BUSINESS_MODELS, CANONICAL_STAGES, CUSTOMER_TYPES, GEO_SCOPES, HQ_STATES, INDUSTRIES, TAGS } from "./startup-taxonomy";

/** Mirrors CONFIRMABLE_FIELDS in store.ts (kept literal here so this module stays server-only-free). */
export const CONFIRMABLE_FIELD_NAMES = ["industry", "business_model", "stage_key", "customer_types", "geo_scope", "hq_state", "tags"] as const;

export const taxonomyPatchSchema = z
  .object({
    industry: z.enum(INDUSTRIES).optional(),
    business_model: z.enum(BUSINESS_MODELS).optional(),
    stage_key: z.enum(CANONICAL_STAGES).optional(),
    customer_types: z.array(z.enum(CUSTOMER_TYPES)).max(CUSTOMER_TYPES.length).optional(),
    geo_scope: z.enum(GEO_SCOPES).nullable().optional(),
    hq_state: z.enum(HQ_STATES).nullable().optional(),
    tags: z.array(z.enum(TAGS)).max(TAGS.length).optional(),
    not_sure: z.array(z.enum(CONFIRMABLE_FIELD_NAMES)).max(CONFIRMABLE_FIELD_NAMES.length).optional(),
    confirm: z.boolean(),
  })
  .strict();
export type TaxonomyPatchBody = z.infer<typeof taxonomyPatchSchema>;
