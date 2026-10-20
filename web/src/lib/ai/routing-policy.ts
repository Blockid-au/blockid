// A2 (pricing v5 §7.4, G35) — the runtime routing policy the model
// coordinator writes (`content/reports/ai-routing-policy.json`) and the
// dispatcher (ai-client.ts) reads, exactly like ai-free-models.json.
//
// Two sections with different authority:
//
//   free   AUTO. Per free provider (groq / cerebras / sambanova / openrouter):
//          `promoted` ids move to the head of that provider's ladder,
//          `demoted` ids are skipped. Written by the coordinator after an
//          eval run; ignored once older than FREE_POLICY_MAX_AGE_MS so a dead
//          eval cron can never pin a stale ordering forever.
//   paid   PROPOSAL ONLY. The coordinator writes `paid.proposal`; nothing
//          reads it for routing. Only an admin Approve (POST
//          /api/admin/ai-health/routing-policy, audited) copies a proposal
//          into `paid.active`; Rollback restores `paid.previous`. The
//          dispatcher applies `paid.active` to the DeepInfra ladders.
//
// Safety rules (the dispatcher's behaviour with a missing / invalid / empty
// file is byte-for-byte today's routing — routing-policy.test.ts and
// ai-client.test.ts pin this):
//   • a policy can only REORDER or SKIP ids already in the ladder it is
//     applied to — it never adds a model (a new model enters the report
//     scope only through catalogue admission + the founder-approved price
//     policy, G30);
//   • a policy can never empty a ladder: if every id would be skipped, the
//     original ladder is returned unchanged;
//   • the scoped (customer report) DeepInfra ladder is further intersected
//     with REPORT_ADMITTED_MODELS by the caller.
//
// Uses `fs` (not node:fs) so the ai-client suite's fs mock serves it, and the
// monotonic clock for its cache (the dispatcher's tests own Date.now()).

import * as fs from "fs";
import { z } from "zod";
import { runtimeReportsPath } from "@/lib/runtime-paths";

export const ROUTING_POLICY_FILE_NAME = "ai-routing-policy.json";
export const ROUTING_POLICY_HISTORY_FILE_NAME = "ai-routing-policy-history.jsonl";
/** Two missed weekly full runs (plus slack) → the free section is ignored. */
export const FREE_POLICY_MAX_AGE_MS = 15 * 24 * 60 * 60_000;
const CACHE_MS = 60_000;

/** Free providers whose ladders the coordinator may reorder automatically. */
export const FREE_POLICY_PROVIDERS = ["groq", "cerebras", "sambanova", "openrouter"] as const;
export type FreePolicyProvider = (typeof FREE_POLICY_PROVIDERS)[number];

/** DeepInfra dispatcher classes a paid ladder can be approved for. */
export const PAID_POLICY_CLASSES = ["report", "synthesis", "classify"] as const;
export type PaidPolicyClass = (typeof PAID_POLICY_CLASSES)[number];

const ModelList = z.array(z.string().min(1).max(200)).max(40);

const FreeProviderPolicy = z.object({
  promoted: ModelList.default([]),
  demoted: ModelList.default([]),
});

const PaidLadders = z.object({
  report: ModelList.optional(),
  synthesis: ModelList.optional(),
  classify: ModelList.optional(),
});
export type PaidLadders = z.infer<typeof PaidLadders>;

export const PaidProposal = z.object({
  id: z.string().min(1),
  proposed_at: z.string(),
  /** The ladders the coordinator proposes (full ordered lists per class). */
  ladders: PaidLadders,
  /** Human-readable why (wins / demotion signals), one line each. */
  reasons: z.array(z.string()).default([]),
  /** Ids the proposal mentions that are not report-admitted yet (founder: catalogue + price policy first). */
  needs_admission: z.array(z.string()).default([]),
  /** Run ids the evidence came from. */
  evidence_runs: z.array(z.string()).default([]),
});
export type PaidProposal = z.infer<typeof PaidProposal>;

export const RoutingPolicy = z.object({
  version: z.literal(1),
  updated_at: z.string(),
  free: z
    .object({
      updated_at: z.string(),
      providers: z.record(z.string(), FreeProviderPolicy).default({}),
      reasons: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
  paid: z
    .object({
      active: PaidLadders.nullable().default(null),
      approved_at: z.string().nullable().default(null),
      approved_by: z.string().nullable().default(null),
      approved_proposal_id: z.string().nullable().default(null),
      /** The `active` value before the last approve — what Rollback restores (null = dispatcher defaults). */
      previous: PaidLadders.nullable().default(null),
      proposal: PaidProposal.nullable().default(null),
    })
    .default({ active: null, approved_at: null, approved_by: null, approved_proposal_id: null, previous: null, proposal: null }),
});
export type RoutingPolicy = z.infer<typeof RoutingPolicy>;

export function routingPolicyFile(): string {
  return runtimeReportsPath(ROUTING_POLICY_FILE_NAME);
}

export function routingPolicyHistoryFile(): string {
  return runtimeReportsPath(ROUTING_POLICY_HISTORY_FILE_NAME);
}

/** Validate a parsed object; anything malformed → null (= no policy, today's routing). Pure. */
export function parseRoutingPolicy(raw: unknown): RoutingPolicy | null {
  const parsed = RoutingPolicy.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** An empty policy (what the coordinator starts from when no file exists). */
export function emptyRoutingPolicy(now: Date = new Date()): RoutingPolicy {
  return RoutingPolicy.parse({ version: 1, updated_at: now.toISOString() });
}

/**
 * Apply a provider's free section to its ladder. Pure.
 * Promoted ids (present in the ladder) first in policy order, then the rest
 * in ladder order; demoted ids dropped — unless that would empty the ladder.
 */
export function applyFreeRoutingPolicy(provider: string, ladder: readonly string[], policy: RoutingPolicy | null, now: number | null = null): string[] {
  const free = policy?.free;
  if (!free || ladder.length === 0) return [...ladder];
  if (now !== null) {
    const at = Date.parse(free.updated_at);
    if (!Number.isFinite(at) || now - at > FREE_POLICY_MAX_AGE_MS || at - now > 5 * 60_000) return [...ladder];
  }
  const p = free.providers[provider];
  if (!p) return [...ladder];
  const inLadder = new Set(ladder);
  const demoted = new Set(p.demoted);
  const head = p.promoted.filter((m, i, a) => inLadder.has(m) && !demoted.has(m) && a.indexOf(m) === i);
  const headSet = new Set(head);
  const ordered = [...head, ...ladder.filter((m) => !headSet.has(m) && !demoted.has(m))];
  return ordered.length > 0 ? ordered : [...ladder];
}

/**
 * The admin-approved DeepInfra ladder for a class, constrained to `allowed`
 * (the ids the caller would dial today — the default ladder, intersected
 * with REPORT_ADMITTED_MODELS on the scoped path). Approved ids come first
 * in approved order, then the remaining allowed ids keep their default order
 * (an approve reorders; a paid id left out of the approved ladder is
 * "demoted" to the back, never dropped — no capacity is lost). Null when
 * nothing applies → caller keeps its default. Pure.
 */
export function approvedPaidLadder(cls: string, allowed: readonly string[], policy: RoutingPolicy | null): string[] | null {
  const active = policy?.paid.active;
  if (!active || !(PAID_POLICY_CLASSES as readonly string[]).includes(cls)) return null;
  const approved = active[cls as PaidPolicyClass];
  if (!approved || approved.length === 0) return null;
  const allowedSet = new Set(allowed);
  const head = approved.filter((m, i, a) => allowedSet.has(m) && a.indexOf(m) === i);
  if (head.length === 0) return null;
  const headSet = new Set(head);
  return [...head, ...allowed.filter((m) => !headSet.has(m))];
}

// ── Cached reader (dispatcher side) ───────────────────────────────────

let cache: { tick: number; policy: RoutingPolicy | null } | null = null;

/** The current policy (file re-read at most every 60 s). Missing / unreadable / invalid → null. */
export function readRoutingPolicy(): RoutingPolicy | null {
  const tick = performance.now();
  if (!cache || tick - cache.tick >= CACHE_MS) {
    let policy: RoutingPolicy | null = null;
    try {
      policy = parseRoutingPolicy(JSON.parse(fs.readFileSync(routingPolicyFile(), "utf-8")));
    } catch {
      policy = null;
    }
    cache = { tick, policy };
  }
  return cache.policy;
}

/** Uncached read for writers (coordinator, admin route): never the 60 s copy. */
export function readRoutingPolicyFresh(file: string = routingPolicyFile()): RoutingPolicy | null {
  try {
    return parseRoutingPolicy(JSON.parse(fs.readFileSync(file, "utf-8")));
  } catch {
    return null;
  }
}

export function _resetRoutingPolicyCache(): void {
  cache = null;
}

/** Dispatcher hook: a free provider's ladder after the (fresh) free policy. */
export function freeLadderWithPolicy(provider: string, ladder: readonly string[]): string[] {
  const policy = readRoutingPolicy();
  if (!policy?.free) return [...ladder];
  return applyFreeRoutingPolicy(provider, ladder, policy, Date.now());
}

/** Dispatcher hook: the DeepInfra ladder for a class after an approved paid policy (or `allowed` unchanged). */
export function paidLadderWithPolicy(cls: string, allowed: readonly string[]): string[] {
  const policy = readRoutingPolicy();
  if (!policy?.paid.active) return [...allowed];
  return approvedPaidLadder(cls, allowed, policy) ?? [...allowed];
}
