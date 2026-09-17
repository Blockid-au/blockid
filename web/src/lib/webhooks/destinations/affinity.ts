// G14-S38 — Affinity CRM destination (v1 REST API, api.affinity.co).
//
// Each delivery becomes ONE note on the organisation the evaluator chose
// (config.organization_id — e.g. a "BlockID deal alerts" organisation, or
// the fund's own record) and, when `list_id` is set, a follow-up request
// adds that organisation to the list (Affinity answers 4xx when the entry
// already exists; the dispatcher books it as a failed delivery so the
// ledger shows it — the note itself has landed). Per-startup organisation
// mapping (domain lookup) is the documented follow-up.
//
// Auth: HTTP Basic with an empty user and the API key as the password —
// exactly what Affinity documents. The key lives ONLY in the sealed config.

import { z } from "zod";
import type { WebhookEnvelope } from "../registry";
import { summariseEnvelope } from "./summary";
import type { Destination, DestinationPlan, DestinationRequest } from "./types";

export const AFFINITY_HOSTS = ["api.affinity.co"] as const;
export const AFFINITY_BASE = "https://api.affinity.co";

export const affinityConfigSchema = z
  .object({
    api_version: z.literal(1),
    api_key: z.string().min(16).max(200),
    organization_id: z.number().int().positive(),
    list_id: z.number().int().positive().optional(),
  })
  .strict();
export type AffinityConfig = z.infer<typeof affinityConfigSchema>;

/** Affinity v1: Basic auth, empty user, API key as password. */
export function affinityAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`:${apiKey}`, "utf8").toString("base64")}`;
}

export function buildAffinityNote(envelope: WebhookEnvelope): string {
  const s = summariseEnvelope(envelope);
  const lines = [`BlockID · ${s.title}`];
  if (s.startup) lines.push(`Startup: ${s.startup}`);
  for (const f of s.fields) if (f.label !== "Startup") lines.push(`${f.label}: ${f.value}`);
  if (s.link) lines.push(`Open: ${s.link}`);
  lines.push(`event ${envelope.event} · delivery ${envelope.id} · ${envelope.created_at}`);
  return lines.join("\n");
}

export const affinityDestination: Destination<AffinityConfig> = {
  kind: "affinity",
  label: "Affinity (note on an organisation)",
  hostAllowList: AFFINITY_HOSTS,
  configSchema: affinityConfigSchema,
  endpointUrl: () => `${AFFINITY_BASE}/notes`,
  transform(envelope, config): DestinationPlan {
    const headers = { "Content-Type": "application/json", Authorization: affinityAuthHeader(config.api_key) };
    const note: DestinationRequest = {
      url: `${AFFINITY_BASE}/notes`,
      headers,
      body: JSON.stringify({ content: buildAffinityNote(envelope), organization_ids: [config.organization_id] }),
    };
    const followUps: DestinationRequest[] = [];
    if (config.list_id) {
      followUps.push({
        url: `${AFFINITY_BASE}/lists/${config.list_id}/list-entries`,
        headers,
        body: JSON.stringify({ entity_id: config.organization_id }),
      });
    }
    return followUps.length ? { ...note, followUps } : note;
  },
  publicConfig: (c) => ({ api_version: 1, organization_id: c.organization_id, list_id: c.list_id ?? null }),
};
