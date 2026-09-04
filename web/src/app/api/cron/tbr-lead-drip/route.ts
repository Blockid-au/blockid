// POST /api/cron/tbr-lead-drip
//
// Wave 31c — 4-hourly cron that advances eligible investor leads through the
// drip sequence. Step 1 is sent inline from the lead route; this cron handles:
//
//   Step 2 (T+2 days) — SVI delta email, warm | ready_to_talk only.
//                       Skipped if no fresher SVI snapshot exists.
//   Step 3 (T+7 days) — soft nudge + feedback poll, all interest levels.
//
// Eligibility is enforced with NOT EXISTS on tbr_lead_drips (idempotency) and
// investor_unsubscribes (opt-out). Auth: `Authorization: Bearer $CRON_SECRET`.

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import {
  renderStep2,
  renderStep3,
  type Step2Context,
  type Step3Context,
} from "@/lib/investor-drips/templates";
import {
  resolveStartupContext,
  shareUrl,
  unsubscribeUrl,
} from "@/lib/investor-drips/send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface LeadRow {
  id: number;
  share_token: string;
  project_id: string | null;
  investor_email: string;
  investor_name: string | null;
  interest_level: string;
  created_at: string;
}

function baseUrl(request: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  try {
    const u = new URL(request.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "https://blockid.au";
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase_unavailable" }, { status: 503 });
  }

  const site = baseUrl(request);
  const now = Date.now();
  const step2Cutoff = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
  const step3Cutoff = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ----- Step 2 candidates (warm | ready_to_talk, T+2 days) -----------------
  const step2Sent = { sent: 0, skippedNoDelta: 0, skippedUnsub: 0, failures: 0 };
  const step2Leads = await selectEligible(supabase, {
    step: 2,
    cutoff: step2Cutoff,
    interestFilter: ["warm", "ready_to_talk"],
  });

  for (const lead of step2Leads) {
    try {
      if (await unsubscribedGate(supabase, lead.investor_email)) {
        step2Sent.skippedUnsub++;
        continue;
      }
      const startup = await resolveStartupContext(lead.project_id, lead.share_token);
      if (!startup || startup.sviCurrent == null) {
        step2Sent.skippedNoDelta++;
        continue;
      }
      // Look up the SVI snapshot the investor would have seen at lead time
      // (any snapshot for this share_token created before lead.created_at).
      const priorSvi = await priorSviAtLeadTime(supabase, lead.share_token, lead.created_at);
      if (priorSvi == null || priorSvi === startup.sviCurrent) {
        step2Sent.skippedNoDelta++;
        continue;
      }
      const delta = startup.sviCurrent - priorSvi;

      const claimed = await claimSlot(supabase, lead.id, 2);
      if (!claimed) continue; // duplicate, already sent

      const ctx: Step2Context = {
        startupName: startup.startupName,
        sector: startup.sector,
        stage: startup.stage,
        shareUrl: shareUrl(lead.share_token, site),
        unsubscribeUrl: unsubscribeUrl(lead.investor_email, site),
        investorName: lead.investor_name,
        sviCurrent: startup.sviCurrent,
        sviPrevious: priorSvi,
        sviDelta: delta,
      };
      const rendered = renderStep2(ctx);
      const result = await sendEmail({
        to: lead.investor_email,
        subject: rendered.subject,
        html: rendered.html,
        unsubscribeUrl: ctx.unsubscribeUrl,
      });
      if (result.ok) {
        step2Sent.sent++;
      } else {
        step2Sent.failures++;
        await releaseSlot(supabase, lead.id, 2);
      }
    } catch (err) {
      step2Sent.failures++;
      console.warn("[tbr-lead-drip] step2 tick failed for lead", lead.id, err);
    }
  }

  // ----- Step 3 candidates (all interest levels, T+7 days) ------------------
  const step3Sent = { sent: 0, skippedUnsub: 0, failures: 0 };
  const step3Leads = await selectEligible(supabase, {
    step: 3,
    cutoff: step3Cutoff,
    interestFilter: null,
  });

  for (const lead of step3Leads) {
    try {
      if (await unsubscribedGate(supabase, lead.investor_email)) {
        step3Sent.skippedUnsub++;
        continue;
      }
      const startup = await resolveStartupContext(lead.project_id, lead.share_token);
      if (!startup) continue;

      const claimed = await claimSlot(supabase, lead.id, 3);
      if (!claimed) continue;

      const share = shareUrl(lead.share_token, site);
      const ctx: Step3Context = {
        startupName: startup.startupName,
        sector: startup.sector,
        stage: startup.stage,
        shareUrl: share,
        unsubscribeUrl: unsubscribeUrl(lead.investor_email, site),
        investorName: lead.investor_name,
        founderContactEmail: startup.founderContactEmail,
        feedbackUrl: `${share}?feedback=1`,
      };
      const rendered = renderStep3(ctx);
      const result = await sendEmail({
        to: lead.investor_email,
        subject: rendered.subject,
        html: rendered.html,
        unsubscribeUrl: ctx.unsubscribeUrl,
      });
      if (result.ok) {
        step3Sent.sent++;
      } else {
        step3Sent.failures++;
        await releaseSlot(supabase, lead.id, 3);
      }
    } catch (err) {
      step3Sent.failures++;
      console.warn("[tbr-lead-drip] step3 tick failed for lead", lead.id, err);
    }
  }

  return NextResponse.json({
    ok: true,
    step1: "inline (lead route)",
    step2: step2Sent,
    step3: step3Sent,
    ran_at: new Date().toISOString(),
  });
}

// ---------- helpers ----------------------------------------------------------

type SupabaseAdmin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

interface SelectArgs {
  step: 2 | 3;
  cutoff: string;
  interestFilter: string[] | null;
}

async function selectEligible(sb: SupabaseAdmin, args: SelectArgs): Promise<LeadRow[]> {
  // Grab all leads older than the cutoff for this step. Filter out already-
  // sent + unsubscribed rows in code — PostgREST doesn't support NOT EXISTS
  // subqueries in filter chains, and the volume here is tiny (< a few hundred
  // eligible per tick in the foreseeable future).
  let query = sb
    .from("tbr_leads")
    .select("id, share_token, project_id, investor_email, investor_name, interest_level, created_at")
    .lt("created_at", args.cutoff)
    .order("created_at", { ascending: true })
    .limit(500);
  if (args.interestFilter) query = query.in("interest_level", args.interestFilter);
  const { data, error } = await query;
  if (error || !data) return [];

  const leads = data as LeadRow[];
  if (leads.length === 0) return [];

  const ids = leads.map((l) => l.id);
  const { data: drips } = await sb
    .from("tbr_lead_drips")
    .select("lead_id")
    .in("lead_id", ids)
    .eq("step", args.step);
  const sent = new Set(((drips ?? []) as { lead_id: number }[]).map((d) => d.lead_id));
  return leads.filter((l) => !sent.has(l.id));
}

async function unsubscribedGate(sb: SupabaseAdmin, email: string): Promise<boolean> {
  const { data } = await sb
    .from("investor_unsubscribes")
    .select("email")
    .eq("email", email.toLowerCase())
    .maybeSingle();
  return !!data;
}

async function claimSlot(sb: SupabaseAdmin, leadId: number, step: 2 | 3): Promise<boolean> {
  const { error } = await sb.from("tbr_lead_drips").insert({ lead_id: leadId, step });
  return !error;
}

async function releaseSlot(sb: SupabaseAdmin, leadId: number, step: 2 | 3): Promise<void> {
  await sb.from("tbr_lead_drips").delete().eq("lead_id", leadId).eq("step", step);
}

/** SVI snapshot value that existed at the moment the lead was captured. */
async function priorSviAtLeadTime(
  sb: SupabaseAdmin,
  shareToken: string,
  leadCreatedAt: string,
): Promise<number | null> {
  // The snapshot bound to this share_token doesn't rewrite in place — new
  // snapshots supersede via report_share_token reassignment. Fall back to the
  // account's snapshot history, taking the last snapshot on-or-before leadTime.
  const { data: snap } = await sb
    .from("svi_snapshots")
    .select("account_id, svi_total, created_at")
    .eq("report_share_token", shareToken)
    .maybeSingle();
  const s = snap as { account_id: string | null; svi_total: number | null; created_at: string | null } | null;
  if (!s?.account_id) return null;

  const { data: prior } = await sb
    .from("svi_snapshots")
    .select("svi_total, created_at")
    .eq("account_id", s.account_id)
    .lte("created_at", leadCreatedAt)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const p = prior as { svi_total: number | null } | null;
  return p?.svi_total ?? null;
}
