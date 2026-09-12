// POST /api/founder/crm-push
//
// Pushes the active startup's profile + latest SVI score to any CRM via
// a Zapier webhook. The Zapier Zap receives the payload and routes it to
// HubSpot, Salesforce, Pipedrive, etc.
//
// Rate limit: 5 pushes per hour per user (per-user, not per-IP).
// Requires: ZAPIER_WEBHOOK_URL env var.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { projectScopeOrDeny } from "@/lib/project-members/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { apiRoute } from "@/lib/audit/api-route";

export const dynamic = "force-dynamic";

function unauth() {
  return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
}
function noDb() {
  return NextResponse.json({ ok: false, error: "Database not configured" }, { status: 503 });
}
function noProject() {
  return NextResponse.json({ ok: false, error: "No active project" }, { status: 400 });
}

async function POST_handler(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) return unauth();

  // ── Rate limit: 5 pushes / hour / user ───────────────────────────────
  const limited = enforceRateLimit("crm-push", user.id, request, 5, 60 * 60 * 1000);
  if (limited) return limited;

  // ── Webhook config check ─────────────────────────────────────────────
  const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { ok: false, error: "CRM push not configured — set ZAPIER_WEBHOOK_URL" },
      { status: 501 },
    );
  }

  // ── DB ───────────────────────────────────────────────────────────────
  const sb = getSupabaseAdmin();
  if (!sb) return noDb();

  // S18-A — pushing the project's profile to an external CRM is a write-
  // class action (editor+); the project row is read on the OWNER's key.
  const { scope, denied } = await projectScopeOrDeny("editor");
  if (denied) return denied;
  const projectId = scope?.projectId ?? null;
  if (!projectId) return noProject();

  // ── Fetch startup profile ─────────────────────────────────────────────
  const { data: project, error: projErr } = await sb
    .from("projects")
    .select("name, description, industry, stage, website")
    .eq("id", projectId)
    .eq("user_id", scope?.ownerUserId ?? user.id)
    .single();

  if (projErr) {
    return NextResponse.json({ ok: false, error: projErr.message }, { status: 500 });
  }
  if (!project) return noProject();

  // ── Fetch latest SVI score (optional — no error if missing) ───────────
  const { data: snap } = await sb
    .from("svi_snapshots")
    .select("svi_total")
    .eq("project_id", projectId)
    .order("snapshot_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sviScore: number | null = snap?.svi_total ?? null;

  // ── Build payload ─────────────────────────────────────────────────────
  const pushedAt = new Date().toISOString();
  const payload = {
    startup_name: project.name ?? "",
    description: project.description ?? "",
    sector: project.industry ?? "",
    stage: project.stage ?? 0,
    website: project.website ?? "",
    svi_score: sviScore,
    founder_email: user.email,
    blockid_url: `https://blockid.au/id/${projectId}`,
    pushed_at: pushedAt,
  };

  // ── POST to Zapier ────────────────────────────────────────────────────
  let zapRes: Response;
  try {
    zapRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Network error";
    return NextResponse.json(
      { ok: false, error: `Zapier webhook unreachable: ${msg}` },
      { status: 502 },
    );
  }

  if (!zapRes.ok) {
    return NextResponse.json(
      { ok: false, error: `Zapier responded ${zapRes.status}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, pushed_at: pushedAt });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts); exemptions live in src/lib/audit/allowlist.json.
export const POST = apiRoute({ route: "api/founder/crm-push/route.ts", method: "POST" }, POST_handler);
