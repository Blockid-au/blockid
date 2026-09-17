// G14-S38 — destination registry + the config seal (same scheme as the
// signing secret in lib/webhooks/sign.ts). Pure apart from node:crypto
// (through sign.ts); no Supabase.

import { openSecret, sealSecret } from "../sign";
import type { WebhookEnvelope } from "../registry";
import { affinityDestination, type AffinityConfig } from "./affinity";
import { airtableDestination, type AirtableConfig } from "./airtable";
import { slackDestination, type SlackConfig } from "./slack";
import { hostOf, isDestinationKind, type Destination, type DestinationKind, type DestinationPlan, type TransformKind } from "./types";

export { DESTINATION_KINDS, isDestinationKind, hostOf } from "./types";
export type { DestinationKind, TransformKind, DestinationPlan, DestinationRequest } from "./types";

export type DestinationConfig = SlackConfig | AffinityConfig | AirtableConfig;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<TransformKind, Destination<any>> = {
  slack: slackDestination,
  affinity: affinityDestination,
  airtable: airtableDestination,
};

export const DESTINATION_LABELS: Record<DestinationKind, string> = {
  generic: "Generic JSON (signed) — Zapier, Make, your own receiver",
  slack: slackDestination.label,
  affinity: affinityDestination.label,
  airtable: airtableDestination.label,
};

export function destinationFor(kind: TransformKind): Destination<DestinationConfig> {
  return REGISTRY[kind] as Destination<DestinationConfig>;
}

/** Hosts the dispatcher accepts for a kind (generic = any public https host, via the SSRF guard). */
export function hostAllowList(kind: DestinationKind): readonly string[] | null {
  return kind === "generic" ? null : REGISTRY[kind].hostAllowList;
}

export function isHostAllowed(url: string, kind: DestinationKind): boolean {
  const allow = hostAllowList(kind);
  if (!allow) return true;
  const host = hostOf(url);
  return host !== null && allow.includes(host);
}

// ── Create-time input ───────────────────────────────────────────────────────

export type DestinationInputError = "unknown_kind" | "url_required" | "invalid_destination" | "host_not_allowed";
export type DestinationInput =
  | { ok: true; kind: "generic"; url: string; config: null }
  | { ok: true; kind: TransformKind; url: string; config: DestinationConfig }
  | { ok: false; error: DestinationInputError; issues?: Array<{ path: string; message: string }>; allowed?: readonly string[] };

function kindOf(raw: unknown): DestinationKind | null {
  if (raw === undefined || raw === null || raw === "") return "generic";
  return isDestinationKind(raw) ? raw : null;
}

/** Validate what the create route received for a destination (userUrl = the body url). */
export function parseDestinationInput(rawKind: unknown, rawConfig: unknown, userUrl: string | null): DestinationInput {
  const kind = kindOf(rawKind);
  if (!kind) return { ok: false, error: "unknown_kind" };
  if (kind === "generic") {
    if (!userUrl) return { ok: false, error: "url_required" };
    return { ok: true, kind, url: userUrl, config: null };
  }
  return parseTransformInput(kind, rawConfig, userUrl);
}

function parseTransformInput(kind: TransformKind, rawConfig: unknown, userUrl: string | null): DestinationInput {
  const dest = destinationFor(kind);
  const given = rawConfig && typeof rawConfig === "object" ? (rawConfig as Record<string, unknown>) : {};
  const parsed = dest.configSchema.safeParse({ api_version: 1, ...given });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return { ok: false, error: "invalid_destination", issues };
  }
  const url = dest.endpointUrl(parsed.data, userUrl);
  if (!url) return { ok: false, error: "url_required" };
  if (!isHostAllowed(url, kind)) return { ok: false, error: "host_not_allowed", allowed: dest.hostAllowList };
  return { ok: true, kind, url, config: parsed.data };
}

// ── Config at rest ──────────────────────────────────────────────────────────

/** Seal a validated config for `webhook_endpoints.destination_config_enc` (throws in production without a key — same as sealSecret). */
export function sealDestinationConfig(config: DestinationConfig, env: NodeJS.ProcessEnv = process.env): string {
  return sealSecret(JSON.stringify(config), env);
}

/** Open + re-validate a sealed config for `kind`. Null when unreadable, tampered or off-shape. */
export function openDestinationConfig(kind: TransformKind, sealed: string | null | undefined, env: NodeJS.ProcessEnv = process.env): DestinationConfig | null {
  const raw = openSecret(sealed, env);
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = destinationFor(kind).configSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

// ── Dispatch-time plan ──────────────────────────────────────────────────────

export type PlanResult = { ok: true; plan: DestinationPlan } | { ok: false; error: string };
/** Delivery error prefix when a transformed url is off the kind's allow list. */
export const HOST_REFUSED = "host_not_allowed:";

function transformSafe(kind: TransformKind, envelope: WebhookEnvelope, config: DestinationConfig, endpointUrl: string): PlanResult {
  try {
    return { ok: true, plan: destinationFor(kind).transform(envelope, config, endpointUrl) };
  } catch (err) {
    return { ok: false, error: `transform_failed:${err instanceof Error ? err.message.slice(0, 80) : "unknown"}` };
  }
}

/** The request(s) the dispatcher sends for a non-generic endpoint; every url must sit on the kind's allow list. */
export function planDelivery(kind: TransformKind, envelope: WebhookEnvelope, config: DestinationConfig, endpointUrl: string): PlanResult {
  const r = transformSafe(kind, envelope, config, endpointUrl);
  if (!r.ok) return r;
  const all = [r.plan, ...(r.plan.followUps ?? [])];
  const bad = all.find((req) => !isHostAllowed(req.url, kind));
  if (bad) return { ok: false, error: HOST_REFUSED + (hostOf(bad.url) ?? "invalid_url") };
  return r;
}
