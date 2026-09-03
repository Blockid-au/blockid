// Wave 25 Phase B — auto-email the Trusted Business Report to the founder.
//
// Called fire-and-forget from `/api/svi/dimensions/stream` after the
// criteria-synthesis step succeeds. Sends an HTML email with:
//   - Executive summary + SVI band
//   - Top-3 strengths + top-3 gaps (from criterion synthesis)
//   - Link to /workspace/business-report + public /tbr/<token> share URL
//   - PDF attachment (fetched internally from /api/svi/report/pdf?token=<t>)
//
// Idempotent on the underlying snapshot row via
// `svi_snapshots.report_email_sent_at` (migration 20260904).
//
// Reuses the SMTP relay in `@/lib/email` (Nodemailer Gmail → Resend fallback)
// — no new provider or npm package is wired here.

import { nanoid } from "nanoid";
import { sendEmail } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { CriterionResult } from "@/app/api/svi/dimensions/stream/route";

interface DimEmailInput {
  score: number;
  priority?: "high" | "medium" | "low";
  insights?: string[];
  label?: string;
}

export interface SendReportEmailArgs {
  userId: string;
  projectId: string | null;
  dimResults: Record<string, DimEmailInput>;
  criterionResults: CriterionResult[];
  industry: string | null;
  stage: string | null;
  /** Explicit base URL for links (falls back to env / blockid.au). */
  baseUrl?: string;
}

function baseUrl(explicit?: string): string {
  if (explicit) return explicit.replace(/\/+$/, "");
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  return "https://blockid.au";
}

const DIM_LABELS: Record<string, string> = {
  ftv: "Founder & Team",
  mpc: "Market & Problem",
  ptd: "Product & Tech",
  tre: "Traction & Revenue",
  cgh: "Cap Table & Governance",
  iri: "Investor Readiness",
  lco: "Legal & Compliance",
  svm: "Strategic Vision & Moat",
};

const DIM_WEIGHTS: Record<string, number> = {
  ftv: 15, mpc: 18, ptd: 12, tre: 20, cgh: 12, iri: 10, lco: 8, svm: 5,
};

function computeSvi(dims: Record<string, DimEmailInput>): number {
  let numer = 0;
  let denom = 0;
  for (const [k, v] of Object.entries(dims)) {
    const w = DIM_WEIGHTS[k] ?? 0;
    if (!w || typeof v?.score !== "number") continue;
    numer += v.score * w;
    denom += w;
  }
  return denom > 0 ? Math.round(numer / denom) : 0;
}

function band(svi: number): { label: string; color: string } {
  if (svi >= 70) return { label: "Investor-Ready", color: "#047857" };
  if (svi >= 40) return { label: "Developing", color: "#b45309" };
  return { label: "Early-Stage", color: "#b91c1c" };
}

function pickTopStrengths(criteria: CriterionResult[], n: number): string[] {
  const sorted = [...criteria].sort((a, b) => b.score - a.score);
  const out: string[] = [];
  for (const c of sorted) {
    if (out.length >= n) break;
    const first = (c.strengths ?? [])[0];
    if (first) out.push(`${c.title}: ${first}`);
  }
  return out;
}

function pickTopGaps(criteria: CriterionResult[], n: number): string[] {
  const sorted = [...criteria].sort((a, b) => a.score - b.score);
  const out: string[] = [];
  for (const c of sorted) {
    if (out.length >= n) break;
    const first = (c.gaps ?? [])[0];
    if (first) out.push(`${c.title}: ${first}`);
  }
  return out;
}

function renderHtml(args: {
  startupName: string;
  totalSvi: number;
  bandLabel: string;
  bandColor: string;
  strengths: string[];
  gaps: string[];
  dashboardUrl: string;
  shareUrl: string | null;
  industry: string | null;
  stage: string | null;
}): string {
  const listItems = (items: string[], color: string) =>
    items
      .map(
        (t) =>
          `<li style="margin:6px 0;padding-left:8px;border-left:3px solid ${color};color:#334155;font-size:13px;line-height:1.5;">${escapeHtml(t)}</li>`,
      )
      .join("");
  const shareBlock = args.shareUrl
    ? `<p style="margin:12px 0 4px 0;font-size:13px;color:#334155;">Public share link (send this to an investor — no login required):</p>
       <p style="margin:0 0 20px 0;"><a href="${args.shareUrl}" style="color:#0284c7;font-size:13px;">${args.shareUrl}</a></p>`
    : "";
  return `<!doctype html>
<html><body style="margin:0;padding:20px;background:#f8fafc;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
    <p style="margin:0 0 8px 0;font-size:11px;color:#64748b;letter-spacing:.14em;text-transform:uppercase;font-weight:600;">Your Trusted Business Report is ready</p>
    <h1 style="margin:0 0 4px 0;font-size:16px;color:#0f172a;font-weight:700;">${escapeHtml(args.startupName)}</h1>
    ${args.industry || args.stage ? `<p style="margin:0 0 12px 0;font-size:12px;color:#64748b;">${escapeHtml([args.industry, args.stage].filter(Boolean).join(" · "))}</p>` : ""}
    <div style="margin:16px 0 24px 0;">
      <div style="font-size:48px;font-weight:800;line-height:1;color:${args.bandColor};font-variant-numeric:tabular-nums;">${args.totalSvi}<span style="font-size:20px;color:#64748b;font-weight:400;">/100</span></div>
      <div style="margin-top:6px;font-size:13px;color:${args.bandColor};font-weight:700;">${escapeHtml(args.bandLabel)}</div>
    </div>
    ${args.strengths.length ? `<p style="margin:16px 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#047857;font-weight:700;">Top strengths</p><ul style="margin:0;padding:0;list-style:none;">${listItems(args.strengths, "#10b981")}</ul>` : ""}
    ${args.gaps.length ? `<p style="margin:20px 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#b91c1c;font-weight:700;">Top gaps to close</p><ul style="margin:0;padding:0;list-style:none;">${listItems(args.gaps, "#ef4444")}</ul>` : ""}
    <p style="margin:24px 0 4px 0;font-size:13px;color:#334155;">Open the full 10-page interactive report in your workspace:</p>
    <p style="margin:0 0 20px 0;"><a href="${args.dashboardUrl}" style="display:inline-block;padding:10px 18px;background:#0284c7;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open Business Report</a></p>
    ${shareBlock}
    <p style="margin:20px 0 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#94a3b8;">The 10-page PDF is attached to this email. Directional analysis only — not a formal valuation.</p>
  </div>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Best-effort fetch of the rendered PDF. Returns null on any failure so the
 *  email still ships with a link-only fallback. */
async function fetchPdfBuffer(base: string, token: string): Promise<Buffer | null> {
  try {
    const res = await fetch(`${base}/api/svi/report/pdf?token=${encodeURIComponent(token)}`, {
      method: "GET",
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    console.warn("[wave25b:email-report] pdf fetch failed", err);
    return null;
  }
}

export interface SendReportEmailResult {
  ok: boolean;
  reason?: string;
  sentTo?: string;
  shareToken?: string;
  pdfAttached?: boolean;
}

export async function sendReportEmail(
  args: SendReportEmailArgs,
): Promise<SendReportEmailResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "supabase_unavailable" };

  // Resolve recipient email + a startup label from app_users / svi_accounts.
  const { data: appUser } = await supabase
    .from("app_users")
    .select("email, startup_name")
    .eq("id", args.userId)
    .maybeSingle();
  const email = (appUser?.email as string | undefined)?.trim();
  if (!email) return { ok: false, reason: "no_email" };

  let startupName = (appUser?.startup_name as string | undefined) ?? "";
  if (!startupName) {
    const { data: acc } = await supabase
      .from("svi_accounts")
      .select("startup_name")
      .eq("user_id", args.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    startupName = (acc?.startup_name as string | undefined) ?? "Your Startup";
  }

  // Resolve svi_account_id for scoping the snapshot lookup.
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("id")
    .eq("user_id", args.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const accountId = (account?.id as string | undefined) ?? null;

  // Locate the most-recent snapshot (this is what save-snapshot writes and
  // what /tbr/[token] renders from). We mint a share token here if one is
  // not yet set so the email can include a shareable URL + PDF.
  let shareToken: string | null = null;
  let snapshotId: string | null = null;
  let alreadySent = false;
  if (accountId) {
    let q = supabase
      .from("svi_snapshots")
      .select("id, report_share_token, report_email_sent_at")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (args.projectId) q = q.eq("project_id", args.projectId);
    const { data: snap } = await q.maybeSingle();
    if (snap) {
      snapshotId = (snap as { id: string }).id;
      shareToken = (snap as { report_share_token: string | null }).report_share_token ?? null;
      alreadySent = Boolean((snap as { report_email_sent_at: string | null }).report_email_sent_at);
    }
  }
  if (alreadySent) return { ok: true, reason: "already_sent", sentTo: email };

  // Mint a share token if the snapshot exists but has none yet.
  if (snapshotId && !shareToken) {
    const token = nanoid(24);
    const { error: upErr } = await supabase
      .from("svi_snapshots")
      .update({ report_share_token: token })
      .eq("id", snapshotId);
    if (!upErr) shareToken = token;
  }

  const base = baseUrl(args.baseUrl);
  const dashboardUrl = `${base}/workspace/business-report${args.projectId ? `?pid=${encodeURIComponent(args.projectId)}` : ""}`;
  const shareUrl = shareToken ? `${base}/tbr/${shareToken}` : null;
  const totalSvi = computeSvi(args.dimResults);
  const bnd = band(totalSvi);

  const strengths = pickTopStrengths(args.criterionResults ?? [], 3);
  const gaps = pickTopGaps(args.criterionResults ?? [], 3);

  const html = renderHtml({
    startupName,
    totalSvi,
    bandLabel: bnd.label,
    bandColor: bnd.color,
    strengths,
    gaps,
    dashboardUrl,
    shareUrl,
    industry: args.industry,
    stage: args.stage,
  });

  // Attempt PDF attachment (best-effort — requires a share token).
  let attachments:
    | { filename: string; content: Buffer; contentType: string }[]
    | undefined;
  let pdfAttached = false;
  if (shareToken) {
    const pdf = await fetchPdfBuffer(base, shareToken);
    if (pdf) {
      attachments = [
        {
          filename: "BlockID-Business-Report.pdf",
          content: pdf,
          contentType: "application/pdf",
        },
      ];
      pdfAttached = true;
    }
  }

  const result = await sendEmail({
    to: email,
    subject: `Your Business Report is ready — SVI ${totalSvi}/100 (${bnd.label})`,
    html,
    attachments,
  });

  if (result.ok && snapshotId) {
    // Stamp idempotency marker so a retriggered SSE run doesn't re-send.
    await supabase
      .from("svi_snapshots")
      .update({ report_email_sent_at: new Date().toISOString() })
      .eq("id", snapshotId);
  }

  return {
    ok: result.ok,
    reason: result.ok ? undefined : (("reason" in result ? result.reason : "send_failed") as string),
    sentTo: email,
    shareToken: shareToken ?? undefined,
    pdfAttached,
  };
}
