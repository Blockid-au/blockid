// Deep Website Technology Audit endpoint
//
// POST /api/website-tech-audit
// Body: { url: string, accountId?: string }
//
// Performs a comprehensive technical analysis of a website URL and returns
// detailed security, performance, tech stack, and product maturity data.
// Optionally creates svi_evidence entries if accountId is provided.

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { deepTechAudit, type TechAuditResult } from "@/lib/rnd-input";

export const dynamic = "force-dynamic";

async function authenticateRequest() {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;
  const store = await cookies();
  const sessionToken = store.get("blockid_session")?.value;
  if (!sessionToken) return null;

  const { data: session } = await supabase
    .from("sessions")
    .select("user_id")
    .eq("token", sessionToken)
    .maybeSingle();
  if (!session) return null;

  const { data: user } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("id", session.user_id)
    .single();
  if (!user) return null;

  return { userId: user.id as string, email: user.email as string };
}

async function findAccountByEmail(email: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;
  const { data } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  return data?.id as string | null;
}

function buildEvidenceEntries(audit: TechAuditResult, accountId: string) {
  const now = new Date().toISOString();
  const entries: Array<{
    account_id: string;
    evidence_type: string;
    label: string;
    value_or_url: string;
    confidence_level: string;
    dimension: string;
    svi_impact: number;
    verified_at: string;
    created_at: string;
  }> = [];

  // Tech stack evidence → PTD
  const techLabel = audit.evidenceLabels.find((l) => l.startsWith("Tech:"));
  if (techLabel) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: techLabel,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "ptd",
      svi_impact: Math.max(0, audit.signalBoosts.ptdBoost),
      verified_at: now,
      created_at: now,
    });
  }

  // Security evidence → LCO
  const secLabel = audit.evidenceLabels.find((l) => l.startsWith("Security:"));
  if (secLabel) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: secLabel,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "lco",
      svi_impact: Math.max(0, audit.signalBoosts.lcoBoost),
      verified_at: now,
      created_at: now,
    });
  }

  // Performance evidence → PTD
  const perfLabel = audit.evidenceLabels.find((l) => l.startsWith("Performance:"));
  if (perfLabel) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: perfLabel,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "ptd",
      svi_impact: audit.performance.ttfbMs < 500 ? 3 : 0,
      verified_at: now,
      created_at: now,
    });
  }

  // Payment detection evidence → TRE
  if (audit.techStack.payments.length > 0) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: `Payments: ${audit.techStack.payments.join(", ")}`,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "tre",
      svi_impact: Math.max(0, audit.signalBoosts.treBoost),
      verified_at: now,
      created_at: now,
    });
  }

  // Analytics evidence → TRE
  if (audit.techStack.analytics.length > 0) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: `Analytics: ${audit.techStack.analytics.join(", ")}`,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "tre",
      svi_impact: 2,
      verified_at: now,
      created_at: now,
    });
  }

  // CDN/Infrastructure evidence → SVM
  if (audit.techStack.cdn || audit.techStack.hosting) {
    entries.push({
      account_id: accountId,
      evidence_type: "tech_audit",
      label: `Infra: ${audit.techStack.cdn ?? audit.techStack.hosting}`,
      value_or_url: audit.url,
      confidence_level: "connected_source",
      dimension: "svm",
      svi_impact: Math.max(0, audit.signalBoosts.svmBoost),
      verified_at: now,
      created_at: now,
    });
  }

  // GitHub link discovered → PTD
  if (audit.productMaturity.githubLink) {
    entries.push({
      account_id: accountId,
      evidence_type: "github",
      label: `GitHub: ${audit.productMaturity.githubLink}`,
      value_or_url: audit.productMaturity.githubLink,
      confidence_level: "connected_source",
      dimension: "ptd",
      svi_impact: 10,
      verified_at: now,
      created_at: now,
    });
  }

  return entries;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { url?: string };

    if (!body?.url || typeof body.url !== "string") {
      return NextResponse.json({ ok: false, error: "url is required" }, { status: 400 });
    }

    // Run deep tech audit
    const audit = await deepTechAudit(body.url);

    // If authenticated, auto-create evidence entries
    const auth = await authenticateRequest();
    let evidenceCreated = 0;

    if (auth && isSupabaseConfigured()) {
      const accountId = await findAccountByEmail(auth.email);
      if (accountId) {
        const supabase = getSupabaseAdmin()!;
        const entries = buildEvidenceEntries(audit, accountId);

        if (entries.length > 0) {
          const { error } = await supabase.from("svi_evidence").insert(entries);
          if (!error) {
            evidenceCreated = entries.length;

            // Fire-and-forget rescore
            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au";
            const cookieHeader = request.headers.get("cookie") ?? "";
            void fetch(`${siteUrl}/api/evidence/rescore`, {
              method: "POST",
              headers: { Cookie: cookieHeader },
            }).catch(() => {});
            void fetch(`${siteUrl}/api/svi/rescore-from-evidence`, {
              method: "POST",
              headers: { Cookie: cookieHeader },
            }).catch(() => {});
          }
        }
      }
    }

    return NextResponse.json({
      ok: true,
      audit,
      evidenceCreated,
    });
  } catch (err) {
    console.error("[blockid:website-tech-audit] POST error", err);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 },
    );
  }
}
