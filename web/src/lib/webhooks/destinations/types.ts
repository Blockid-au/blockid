// G14-S38 — outbound destination contract (Slack / Affinity / Airtable).
//
// A destination is a PURE transformer: `transform(envelope, config)` maps
// the generic webhook envelope (lib/webhooks/registry.ts) to exactly the
// HTTP request the third party expects — url, headers, JSON body — plus,
// for Affinity, an optional follow-up request (the list entry). No I/O, no
// Supabase, no `server-only`: the dispatcher (lib/webhooks/dispatch.ts
// sendOnce) owns the transport, the SSRF guard, the timeout and the retry
// ladder, and refuses any url whose host is not in the kind's
// `hostAllowList` — a config can never point a delivery elsewhere.
//
// Config lives sealed in `webhook_endpoints.destination_config_enc` (0409,
// same AES-GCM scheme as secret_enc — ./index.ts sealDestinationConfig) and
// is versioned by `api_version` so a later shape change can be migrated
// without guessing.

import type { z } from "zod";
import type { WebhookEnvelope } from "../registry";

export const DESTINATION_KINDS = ["generic", "slack", "affinity", "airtable"] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number];
export type TransformKind = Exclude<DestinationKind, "generic">;

export function isDestinationKind(v: unknown): v is DestinationKind {
  return typeof v === "string" && (DESTINATION_KINDS as readonly string[]).includes(v);
}

export interface DestinationRequest {
  url: string;
  headers: Record<string, string>;
  /** Serialised JSON — the dispatcher sends it verbatim. */
  body: string;
}

export interface DestinationPlan extends DestinationRequest {
  /** Sent in order after the primary request succeeded (2xx); the first failure fails the delivery. */
  followUps?: DestinationRequest[];
}

export interface Destination<C extends { api_version: number }> {
  kind: TransformKind;
  label: string;
  /** Hosts the dispatcher accepts for this kind — exact, lower-case. */
  hostAllowList: readonly string[];
  /** Validates the config a user submits (secrets included) — the create route runs it. */
  configSchema: z.ZodType<C>;
  /**
   * The endpoint url stored on the row. Slack keeps the user-supplied
   * incoming-webhook url; Affinity / Airtable derive it from the config.
   */
  endpointUrl(config: C, userUrl: string | null): string | null;
  /** `endpointUrl` = webhook_endpoints.url (Slack uses it; Affinity / Airtable derive their own). */
  transform(envelope: WebhookEnvelope, config: C, endpointUrl: string): DestinationPlan;
  /** What the settings UI may show back — never a secret. */
  publicConfig(config: C): Record<string, string | number | null>;
}

/** Lower-case hostname of a url, or null when unparsable. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}
