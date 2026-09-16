// POST /api/investors/intro — founder "Investors who match" → Request intro
// (G13-W5-D3, S-D3; BA spec §A.5 E2.6, §D.1 E2.6).
//
//   { investor_id, name, firm?, plan?, mandate_id? }
//        → 200 { ok, contact_id, created, notified }
//
// Writes the matched investor as an `investor_contacts` row on the
// founder's ACTIVE project (stage "contacted", source "investor_match") so
// the Pipeline tab shows the ask, and notifies the investor
// (`intro_requested`, direction to_investor). The investor must be a
// discoverable match — the id is re-checked against `app_users` with the
// investor flag on so a founder cannot spam an arbitrary user id.
//
//   401 auth_required · 402 feature_locked (Growth extras — same gate as the
//   Matches tab) · 400 invalid body / no active project · 404 investor not
//   discoverable · 429 over 10/min · 503 DB.

import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { hasGrowthExtras } from "@/lib/funding/growth-extras";
import { requestIntroToInvestor } from "@/lib/investor/actions";
import { PRIVATE_JSON_HEADERS, readJsonBody } from "@/lib/security/request-guards";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const INTROS_PER_MINUTE = 10;

export const founderIntroSchema = z
  .object({
    investor_id: z.string().uuid(),
    name: z.string().min(1).max(120),
    firm: z.string().max(120).nullable().optional(),
    plan: z.string().max(60).nullable().optional(),
    mandate_id: z.string().uuid().nullable().optional(),
  })
  .strict();

const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: PRIVATE_JSON_HEADERS });

/** The investor must be discoverable (a mandate or the legacy flag) — never an arbitrary user id. */
async function isDiscoverableInvestor(investorId: string, mandateId: string | null): Promise<{ ok: boolean; plan: string | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, plan: null };
  const { data: user } = await supabase.from("app_users").select("id, plan, investor_discoverable").eq("id", investorId).maybeSingle();
  const row = (user ?? null) as Record<string, unknown> | null;
  if (!row) return { ok: false, plan: null };
  const plan = row.plan ? String(row.plan) : null;
  if (row.investor_discoverable === true) return { ok: true, plan };
  try {
    let q = supabase.from("investor_mandates").select("id").eq("owner_user_id", investorId).eq("discoverable", true).eq("is_active", true).limit(1);
    if (mandateId) q = q.eq("id", mandateId);
    const { data } = await q.maybeSingle();
    return { ok: !!data, plan };
  } catch {
    return { ok: false, plan };
  }
}

async function POST_handler(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "auth_required" }, { status: 401 });
  if (!(await hasGrowthExtras({ id: user.id, plan: user.plan }))) {
    return json({ ok: false, error: "feature_locked", feature: "report.premium", upgrade_url: "/pricing?feature=report.premium&from=/workspace/investors" }, 402);
  }
  const limited = enforceRateLimit("founder-intro", user.id, request, INTROS_PER_MINUTE, 60 * 1000);
  if (limited) return limited;

  const body = await readJsonBody(request, 4 * 1024);
  if (!body.ok) return body.response;
  const parsed = founderIntroSchema.safeParse(body.body);
  if (!parsed.success) {
    return json({ ok: false, error: "invalid_body", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }, 400);
  }
  const project = await getActiveProject(user.id).catch(() => null);
  if (!project) return json({ ok: false, error: "no_project", message: "Create your startup profile before requesting intros." }, 400);

  const discoverable = await isDiscoverableInvestor(parsed.data.investor_id, parsed.data.mandate_id ?? null);
  if (!discoverable.ok) return json({ ok: false, error: "not_found" }, 404);

  const r = await requestIntroToInvestor({
    founder: { id: user.id, email: user.email, displayName: user.displayName ?? null },
    projectId: project.id,
    startupName: project.name,
    investor: { id: parsed.data.investor_id, name: parsed.data.name, firm: parsed.data.firm ?? null, plan: discoverable.plan ?? parsed.data.plan ?? null, mandateId: parsed.data.mandate_id ?? null },
  });
  if (!r.ok) return json({ ok: false, error: r.error, message: r.message }, r.error === "unavailable" ? 503 : r.error === "invalid_input" ? 400 : 500);
  return json({ ok: true, contact_id: r.contactId, created: r.created, notified: r.notified });
}

export const POST = apiRoute({ route: "api/investors/intro/route.ts", method: "POST" }, POST_handler);
