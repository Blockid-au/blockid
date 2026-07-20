// Admin CRUD for pricing/segment A/B experiments (T0206).
//
// - GET  → all experiments + per-variant summaries in a single payload so
//         the admin page renders in one round-trip.
// - POST → create (name, hypothesis, variants[], trafficSplit).
// - PATCH → mutate an existing experiment's status or traffic split.
//
// Auth: same pattern as /api/admin/credits — email match on ADMIN_EMAIL or
// role === "admin". No new auth model.

import { NextResponse } from "next/server";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  listExperiments,
  summarise,
  type ExperimentStatus,
  type PricingExperimentVariant,
} from "@/lib/pricing-experiments";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.email !== ADMIN_EMAIL && user.role !== "admin") return null;
  return user;
}

const VALID_STATUS: ReadonlySet<ExperimentStatus> = new Set([
  "draft",
  "running",
  "paused",
  "concluded",
]);

function coerceVariantsInput(raw: unknown): PricingExperimentVariant[] | null {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 4) return null;
  const out: PricingExperimentVariant[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const rec = item as Record<string, unknown>;
    const key = typeof rec.key === "string" ? rec.key.trim() : "";
    const label = typeof rec.label === "string" ? rec.label.trim() : "";
    if (!key || !label || seen.has(key)) return null;
    seen.add(key);
    const payload =
      rec.payload && typeof rec.payload === "object" && !Array.isArray(rec.payload)
        ? (rec.payload as Record<string, unknown>)
        : {};
    out.push({ key, label, payload });
  }
  return out;
}

function coerceSplitInput(
  raw: unknown,
  variants: PricingExperimentVariant[],
): Record<string, number> | null {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      const n = typeof v === "number" ? v : Number(v);
      if (!Number.isFinite(n) || n < 0) return null;
      out[k] = n;
    }
  }
  if (Object.keys(out).length === 0) {
    const share = 1 / variants.length;
    for (const v of variants) out[v.key] = share;
  }
  for (const v of variants) {
    if (!(v.key in out)) return null;
  }
  return out;
}

export async function GET() {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ ok: false, error: "Admin required" }, { status: 403 });

  const experiments = await listExperiments();
  const summaries = await Promise.all(
    experiments.map(async (e) => ({ id: e.id, rows: await summarise(e.id) })),
  );
  const summaryMap: Record<string, Awaited<ReturnType<typeof summarise>>> = {};
  for (const s of summaries) summaryMap[s.id] = s.rows;

  return NextResponse.json({ ok: true, experiments, summaries: summaryMap });
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ ok: false, error: "Admin required" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
    hypothesis?: unknown;
    variants?: unknown;
    trafficSplit?: unknown;
  } | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const hypothesis = typeof body.hypothesis === "string" ? body.hypothesis.trim() : "";
  if (!name || !/^[a-z0-9][a-z0-9_-]{2,63}$/i.test(name)) {
    return NextResponse.json(
      { ok: false, error: "name must be 3–64 chars, alnum/underscore/dash" },
      { status: 400 },
    );
  }

  const variants = coerceVariantsInput(body.variants);
  if (!variants) {
    return NextResponse.json(
      { ok: false, error: "variants must be 2–4 items with unique key + label" },
      { status: 400 },
    );
  }
  const trafficSplit = coerceSplitInput(body.trafficSplit, variants);
  if (!trafficSplit) {
    return NextResponse.json(
      { ok: false, error: "trafficSplit must cover every variant with non-negative weights" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("pricing_experiments")
    .insert({
      name,
      hypothesis,
      status: "draft",
      variants,
      traffic_split: trafficSplit,
    })
    .select("id")
    .maybeSingle();

  if (error || !data) {
    const conflict = error?.code === "23505";
    return NextResponse.json(
      { ok: false, error: conflict ? "Name already exists" : (error?.message ?? "Insert failed") },
      { status: conflict ? 409 : 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}

export async function PATCH(request: Request) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ ok: false, error: "Admin required" }, { status: 403 });

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as {
    id?: unknown;
    status?: unknown;
    trafficSplit?: unknown;
  } | null;
  if (!body) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const id = typeof body.id === "string" ? body.id : "";
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.status !== undefined) {
    const status = String(body.status) as ExperimentStatus;
    if (!VALID_STATUS.has(status)) {
      return NextResponse.json({ ok: false, error: "invalid status" }, { status: 400 });
    }
    patch.status = status;
    if (status === "concluded") patch.concluded_at = new Date().toISOString();
  }

  if (body.trafficSplit !== undefined) {
    // We need the existing variants to validate coverage of the new split.
    const { data: existing } = await supabase
      .from("pricing_experiments")
      .select("variants")
      .eq("id", id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    const variants = Array.isArray(existing.variants)
      ? (existing.variants as PricingExperimentVariant[])
      : [];
    const split = coerceSplitInput(body.trafficSplit, variants);
    if (!split) {
      return NextResponse.json(
        { ok: false, error: "trafficSplit must cover every variant with non-negative weights" },
        { status: 400 },
      );
    }
    patch.traffic_split = split;
  }

  const { error } = await supabase.from("pricing_experiments").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
