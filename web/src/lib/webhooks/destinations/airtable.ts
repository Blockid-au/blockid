// G14-S38 — Airtable destination (REST API, api.airtable.com).
//
// Each delivery appends ONE record to the configured table
// (POST /v0/{base_id}/{table}) with `typecast: true` so a "SVI" number
// column and a "Link" url column fill in without the evaluator pre-creating
// every field type. Columns = the shared summary (Event · Title · Startup ·
// SVI · Delta · Link · the event's labelled facts) + `Delivery` (the
// idempotency id) + `Received at`. Auth: a personal access token in the
// sealed config (Bearer) — never on the row's url.

import { z } from "zod";
import type { WebhookEnvelope } from "../registry";
import { summariseEnvelope, summaryToFields } from "./summary";
import type { Destination, DestinationPlan } from "./types";

export const AIRTABLE_HOSTS = ["api.airtable.com"] as const;
export const AIRTABLE_BASE = "https://api.airtable.com/v0";

export const airtableConfigSchema = z
  .object({
    api_version: z.literal(1),
    token: z.string().min(16).max(300),
    base_id: z.string().regex(/^app[A-Za-z0-9]{14}$/, "base_id looks like appXXXXXXXXXXXXXX"),
    table: z.string().min(1).max(100),
  })
  .strict();
export type AirtableConfig = z.infer<typeof airtableConfigSchema>;

export function airtableTableUrl(config: Pick<AirtableConfig, "base_id" | "table">): string {
  return `${AIRTABLE_BASE}/${config.base_id}/${encodeURIComponent(config.table)}`;
}

export function buildAirtableRecord(envelope: WebhookEnvelope): Record<string, unknown> {
  const fields = summaryToFields(summariseEnvelope(envelope));
  return {
    records: [{ fields: { ...fields, Delivery: envelope.id, "Received at": envelope.created_at } }],
    typecast: true,
  };
}

export const airtableDestination: Destination<AirtableConfig> = {
  kind: "airtable",
  label: "Airtable (append a record)",
  hostAllowList: AIRTABLE_HOSTS,
  configSchema: airtableConfigSchema,
  endpointUrl: (config) => airtableTableUrl(config),
  transform(envelope, config): DestinationPlan {
    return {
      url: airtableTableUrl(config),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(buildAirtableRecord(envelope)),
    };
  },
  publicConfig: (c) => ({ api_version: 1, base_id: c.base_id, table: c.table }),
};
