// /api/investor/mandates — the investor's mandates (G13-W3-T2, BA spec
// Appendix 1 "GET/PUT /api/investor/mandates"; §B.7, §B.10 T3, §C.6).
//
//   GET     → { ok, migrated, mandates[], primary, draft, draft_source,
//               limit, can_edit_weights, evaluator, discoverable }
//             `draft` = the form prefill: the primary mandate, else the
//             one-release read-through of app_users.investor_prefs.
//   PUT     → upsert (create when no `id`, update when `id` is one the
//             caller may edit). Body = the 7-section object (Zod
//             `mandateInputSchema`); Scout may hold one mandate.
//   POST    → alias of PUT (create) for the client form.
//   PATCH   → update; `id` required.
//   DELETE  → ?id= soft-deactivates (fit rows dropped by the nightly cron).
//
// Gate: `investor.dealflow` (402 otherwise — same feature every investor
// SKU carries). Every write goes through the lib's ownership checks +
// service role (house pattern) with the 0393 RLS as defence in depth,
// writes the investor_prefs mirror (R4) and audits `mandate.saved`.
// Validation errors → 400 { error: "invalid_body", issues[] }.
// Rate limit 60/min/user, 32 kB body (§C.6).
//
// The old /api/investor/preferences route stays as an alias that writes the
// mirror only (deleted with the mirror after one release).

import { NextResponse, type NextRequest } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { getCurrentUser } from "@/lib/auth";
import { can, recordGateHit } from "@/lib/entitlements";
import { getInvestorVisibility } from "@/lib/investor-portal";
import { apiRoute } from "@/lib/audit/api-route";
import {
  canEditWeights,
  deactivateMandate,
  listMandates,
  mandateDraftFor,
  mandateInputSchema,
  mandateLimitFor,
  upsertMandate,
} from "@/lib/investors/mandates";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const WRITE_RATE_MAX = 60;
export const WRITE_RATE_WINDOW_MS = 60_000;
const BODY_MAX_BYTES = 32 * 1024;

async function gate(req: NextRequest, surface: "api") {
  const user = await getCurrentUser();
  if (!user) return { user: null, response: NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 }) };
  const subset = { id: user.id, plan: user.plan ?? "", segment: "investor" };
  const allowed = await can(subset, "investor.dealflow");
  if (!allowed) {
    await recordGateHit(subset, "investor.dealflow", surface, "api/investor/mandates");
    return { user: null, response: NextResponse.json({ ok: false, error: "feature_locked", feature: "investor.dealflow" }, { status: 402 }) };
  }
  void req;
  return { user, response: null };
}

export async function GET(req: NextRequest) {
  const { user, response } = await gate(req, "api");
  if (!user) return response;
  const [list, visibility, limit] = await Promise.all([listMandates(user.id), getInvestorVisibility(user.id), mandateLimitFor(user.plan)]);
  const draft = await mandateDraftFor(user.id, visibility.discoverable);
  return NextResponse.json(
    {
      ok: true,
      migrated: list.migrated,
      mandates: list.mandates,
      primary: list.primary,
      draft: draft.draft,
      draft_source: draft.source,
      limit: limit === Number.MAX_SAFE_INTEGER ? null : limit,
      can_edit_weights: canEditWeights(user.plan),
      evaluator: visibility.evaluator,
      discoverable: visibility.discoverable,
    },
    { headers: PRIVATE_JSON_HEADERS },
  );
}

async function write(req: NextRequest, mode: "upsert" | "update") {
  const { user, response } = await gate(req, "api");
  if (!user) return response;
  const limited = enforceRateLimit("investor-mandates", user.id, req, WRITE_RATE_MAX, WRITE_RATE_WINDOW_MS);
  if (limited) return limited;
  const read = await readJsonBody<unknown>(req, BODY_MAX_BYTES);
  if (!read.ok) return read.response;

  const parsed = mandateInputSchema.safeParse(read.body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  if (mode === "update" && !parsed.data.id) {
    return NextResponse.json({ ok: false, error: "invalid_body", issues: [{ path: "id", message: "id required" }] }, { status: 400 });
  }
  // Section 7 is Program+ — silently ignored below that tier (the form hides it).
  const input = canEditWeights(user.plan) ? parsed.data : { ...parsed.data, weights: {} };

  const visibility = await getInvestorVisibility(user.id);
  const result = await upsertMandate({ id: user.id, plan: user.plan ?? null, evaluator: visibility.evaluator }, input);
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "limit_reached" ? 402 : result.reason === "not_migrated" ? 503 : 500;
    return NextResponse.json({ ok: false, error: result.reason, ...(result.limit !== undefined ? { limit: result.limit } : {}) }, { status });
  }
  return NextResponse.json(
    { ok: true, mandate: result.mandate, org: result.org, created: result.created, mirror: result.mirror, discoverable: result.mandate.discoverable && visibility.evaluator },
    { status: result.created ? 201 : 200, headers: PRIVATE_JSON_HEADERS },
  );
}

async function PUT_handler(req: NextRequest) {
  return write(req, "upsert");
}
async function POST_handler(req: NextRequest) {
  return write(req, "upsert");
}
async function PATCH_handler(req: NextRequest) {
  return write(req, "update");
}

async function DELETE_handler(req: NextRequest) {
  const { user, response } = await gate(req, "api");
  if (!user) return response;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  const ok = await deactivateMandate(user.id, id);
  return NextResponse.json({ ok }, { status: ok ? 200 : 404 });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts).
export const PUT = apiRoute({ route: "api/investor/mandates/route.ts", method: "PUT" }, PUT_handler);
export const POST = apiRoute({ route: "api/investor/mandates/route.ts", method: "POST" }, POST_handler);
export const PATCH = apiRoute({ route: "api/investor/mandates/route.ts", method: "PATCH" }, PATCH_handler);
export const DELETE = apiRoute({ route: "api/investor/mandates/route.ts", method: "DELETE" }, DELETE_handler);
