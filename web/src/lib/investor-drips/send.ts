// Wave 31c — Investor drip send helpers (Step 1 + shared utilities).
//
// Step 1 is fired from the lead route (T+0). Steps 2 + 3 run from the cron
// (see /api/cron/tbr-lead-drip). This module concentrates the shared bits:
//   - unsubscribeUrl() HMAC token minting
//   - resolveStartupContext() — pulls startup_name, sector, stage from the
//     project + svi_account associated with the share_token
//   - isUnsubscribed() — cheap gate against investor_unsubscribes
//   - sendStep1() — end-to-end (context lookup → send → audit row)
//
// All functions are fail-soft: they log and return false rather than throwing.
// The investor-facing UX must never be blocked by drip failures.

import "server-only";
import { createHmac } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendEmail } from "@/lib/email";
import { renderStep1, type DripContext } from "./templates";

export interface StartupContext {
  startupName: string;
  sector: string | null;
  stage: string | null;
  founderContactEmail: string | null;
  sviCurrent: number | null;
}

/** Mint a stable HMAC-SHA256(email + CRON_SECRET, hex). */
export function unsubscribeToken(email: string): string {
  const secret = process.env.CRON_SECRET ?? "";
  return createHmac("sha256", secret).update(email.toLowerCase()).digest("hex").slice(0, 32);
}

export function unsubscribeUrl(email: string, baseUrl: string): string {
  const t = unsubscribeToken(email);
  const q = `email=${encodeURIComponent(email)}&token=${t}`;
  return `${baseUrl.replace(/\/+$/, "")}/api/investor-unsubscribe?${q}`;
}

export function shareUrl(token: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/tbr/${encodeURIComponent(token)}`;
}

/** True if this investor email is on the unsubscribe list. */
export async function isUnsubscribed(email: string): Promise<boolean> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return false;
    const { data } = await supabase
      .from("investor_unsubscribes")
      .select("email")
      .eq("email", email.toLowerCase())
      .maybeSingle();
    return !!data;
  } catch {
    return false;
  }
}

/** Look up startup name/sector/stage from a project_id (fallback to share_token). */
export async function resolveStartupContext(
  projectId: string | null,
  shareToken: string,
): Promise<StartupContext | null> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;

    let startupName: string | null = null;
    let sector: string | null = null;
    let stage: string | null = null;
    let founderContactEmail: string | null = null;

    if (projectId) {
      const { data: p } = await supabase
        .from("projects")
        .select("name, industry, stage, user_id")
        .eq("id", projectId)
        .maybeSingle();
      const proj = p as { name: string | null; industry: string | null; stage: number | null; user_id: string | null } | null;
      if (proj) {
        startupName = proj.name;
        sector = proj.industry;
        stage = proj.stage != null ? `Stage ${proj.stage}` : null;
        if (proj.user_id) {
          const { data: u } = await supabase
            .from("app_users")
            .select("email")
            .eq("id", proj.user_id)
            .maybeSingle();
          founderContactEmail = (u as { email: string | null } | null)?.email ?? null;
        }
      }
    }

    // Latest SVI snapshot for the shared report.
    const { data: snap } = await supabase
      .from("svi_snapshots")
      .select("svi_total, account_id, stage")
      .eq("report_share_token", shareToken)
      .maybeSingle();
    const s = snap as { svi_total: number | null; account_id: string | null; stage: number | null } | null;
    const sviCurrent = s?.svi_total ?? null;

    // Fill missing fields from svi_accounts if project lookup was empty.
    if (!startupName && s?.account_id) {
      const { data: acct } = await supabase
        .from("svi_accounts")
        .select("startup_name, email, current_stage")
        .eq("id", s.account_id)
        .maybeSingle();
      const a = acct as { startup_name: string | null; email: string | null; current_stage: number | null } | null;
      if (a) {
        startupName = startupName ?? a.startup_name;
        founderContactEmail = founderContactEmail ?? a.email;
        stage = stage ?? (a.current_stage != null ? `Stage ${a.current_stage}` : null);
      }
    }

    if (!startupName) startupName = "the startup";

    return { startupName, sector, stage, founderContactEmail, sviCurrent };
  } catch (err) {
    console.warn("[investor-drips] resolveStartupContext failed:", err);
    return null;
  }
}

interface SendStep1Args {
  leadId: number;
  investorEmail: string;
  investorName: string | null;
  shareToken: string;
  projectId: string | null;
  baseUrl: string;
}

/**
 * End-to-end Step 1 send: resolves context, gates on unsubscribe, sends, then
 * writes the tbr_lead_drips audit row. Never throws.
 */
export async function sendStep1(args: SendStep1Args): Promise<boolean> {
  try {
    if (await isUnsubscribed(args.investorEmail)) return false;

    const supabase = getSupabaseAdmin();
    if (!supabase) return false;

    // Claim the slot first so a crash mid-send doesn't re-fire on retry.
    const { error: claimErr } = await supabase
      .from("tbr_lead_drips")
      .insert({ lead_id: args.leadId, step: 1 });
    if (claimErr) return false; // UNIQUE violation = already sent

    const startup = await resolveStartupContext(args.projectId, args.shareToken);
    if (!startup) {
      // Roll back so a manual retry can try again.
      await supabase.from("tbr_lead_drips").delete().eq("lead_id", args.leadId).eq("step", 1);
      return false;
    }

    const ctx: DripContext = {
      startupName: startup.startupName,
      sector: startup.sector,
      stage: startup.stage,
      shareUrl: shareUrl(args.shareToken, args.baseUrl),
      unsubscribeUrl: unsubscribeUrl(args.investorEmail, args.baseUrl),
      investorName: args.investorName,
    };
    const rendered = renderStep1(ctx);

    const result = await sendEmail({
      to: args.investorEmail,
      subject: rendered.subject,
      html: rendered.html,
      unsubscribeUrl: ctx.unsubscribeUrl,
    });

    if (!result.ok) {
      await supabase.from("tbr_lead_drips").delete().eq("lead_id", args.leadId).eq("step", 1);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[investor-drips] sendStep1 failed:", err);
    return false;
  }
}
