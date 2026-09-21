// Wave 25 Phase B → S-R4 — auto-email the Trusted Business Report to the
// founder, rendered from `ReportV2` (spec §A: every surface renders from
// the one document; §F S-R4: "cover + 3 questions + weakest chapter + CTA").
//
// Called fire-and-forget from the report pipeline after a full run. Sends
// an HTML email with:
//   - cover numbers: SVI, band, Δ vs last snapshot, percentile, stage/phase
//   - the three questions strip (Where / Worth / Next)
//   - the weakest chapter: score, verdict, one gap, next action + its
//     primary visual
//   - CTA to /workspace/reports/business + the public /tbr/<token> link
//   - visuals inlined as CID attachments (PNG from `report-visuals/png.ts`;
//     skipped when the rasteriser is unavailable — the numbers are in the
//     text either way)
//   - the PDF attached, rendered in-process by `lib/pdf/tbr-pdf.tsx`
//     (falls back to fetching /api/svi/report/pdf)
//
// Idempotent on the underlying snapshot row via
// `svi_snapshots.report_email_sent_at` (migration 20260904). Subject line
// and unsubscribe plumbing are unchanged (`@/lib/email` complianceFooter).
//
// Source precedence for the document: `args.reportV2` (the pipeline's own)
// → `svi_snapshots.report_v2` for `args.snapshotId` → the latest snapshot
// for the account → the adapter over the legacy `dimResults` /
// `criterionResults` the caller still passes.

import { nanoid } from "nanoid";
import { sendEmail, complianceFooter } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";
import { stripCitationMarkers } from "@/lib/report-v2/citations";
import type { CriterionResult } from "@/lib/report-pipeline/run-report-pipeline";
import { fromSnapshot, type SnapshotCriterionState, type SnapshotDimState } from "@/lib/report-v2/adapter";
import { loadLatestReportV2ForAccount, loadReportV2BySnapshotId } from "@/lib/report-v2/load";
import { isReportV2, type DimensionChapter, type ReportV2 } from "@/lib/report-v2/schema";
import { visualToPng } from "@/lib/report-visuals/png";
import type { Band, VisualSpecV2 } from "@/lib/report-visuals/types";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";
import { coverPercentileLine } from "@/lib/report-v2/cover-hero";
import { EMAIL_THEME } from "@/lib/email/theme";

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
  /** S-R4: the pipeline's own document when it produced one. */
  reportV2?: ReportV2 | null;
  /** S-R4: the snapshot the run persisted (stored report_v2 is read from it). */
  snapshotId?: string | null;
}

function baseUrl(explicit?: string): string {
  if (explicit) return explicit.replace(/\/+$/, "");
  const env = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (env) return env.replace(/\/+$/, "");
  return "https://blockid.au";
}

// ── Band vocabulary (unchanged subject-line labels) ─────────────────────────

export function bandLabelForEmail(band: Band): { label: string; color: string } {
  if (band === "strong") return { label: "Investor-Ready", color: "#047857" };
  if (band === "developing") return { label: "Developing", color: "#b45309" };
  if (band === "early") return { label: "Early-Stage", color: "#b91c1c" };
  return { label: "Not scored yet", color: EMAIL_THEME.inkTertiary };
}

/** The lowest-scoring scored chapter (ties → heavier weight first, i.e. DIM_ORDER). */
export function weakestChapter(report: ReportV2): DimensionChapter | null {
  const scored = report.dimensions.filter((d) => d.band !== "pending");
  if (!scored.length) return null;
  return scored.reduce((min, d) => (d.score < min.score ? d : min), scored[0]);
}

// ── HTML ────────────────────────────────────────────────────────────────────

export interface ReportEmailImages {
  /** `cid:` references (without the prefix) for the inlined PNGs; null = not inlined. */
  ring: string | null;
  radar: string | null;
  weakest: string | null;
}

export interface RenderReportEmailInput {
  report: ReportV2;
  dashboardUrl: string;
  shareUrl: string | null;
  images?: Partial<ReportEmailImages>;
  /** Spam Act footer (identity + unsubscribe) — see lib/email complianceFooter. */
  footerHtml?: string;
  pdfAttached?: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const img = (cid: string | null | undefined, alt: string, width: number) =>
  cid ? `<img src="cid:${cid}" alt="${escapeHtml(alt)}" width="${width}" style="display:block;max-width:100%;height:auto;border:0;" />` : "";

/** Pure: the email body for a ReportV2 (tested without SMTP). */
export function renderReportEmailHtml(input: RenderReportEmailInput): string {
  const { report, dashboardUrl, shareUrl, images = {}, footerHtml, pdfAttached = true } = input;
  const c = report.cover;
  const band = bandLabelForEmail(c.svi.band);
  const weakest = weakestChapter(report);
  const phase = GROWTH_PHASE_LABELS[c.phaseId]?.[report.locale === "vi" ? "vi" : "en"] ?? c.phaseId;
  const delta = c.svi.deltaVsLast !== null ? `${c.svi.deltaVsLast >= 0 ? "+" : ""}${c.svi.deltaVsLast} vs last snapshot` : null;
  // G21 P1 review: the rank only with its cohort size (score-governance § 7).
  const pct = coverPercentileLine(c.svi);
  const meta = [c.sector, c.stageLabel, `Phase: ${phase}`].filter(Boolean).join(" · ");

  const q = (label: string, text: string, color: string) =>
    `<td style="vertical-align:top;padding:10px;border-left:3px solid ${color};background:#f7f8fa;border-radius:6px;" width="33%">
      <p style="margin:0 0 4px 0;font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6b7280;font-weight:700;">${label}</p>
      <p style="margin:0;font-size:12px;line-height:1.45;color:#0b0f1a;">${escapeHtml(text)}</p>
    </td>`;

  const weakestBlock = weakest
    ? `<p style="margin:22px 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#b45309;font-weight:700;">Weakest chapter — ${escapeHtml(weakest.title)}</p>
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #e5e7eb;border-radius:8px;">
         <tr>
           <td style="padding:12px;vertical-align:top;">
             <p style="margin:0;font-size:28px;font-weight:800;color:${bandLabelForEmail(weakest.band).color};line-height:1;">${weakest.score}<span style="font-size:12px;color:#6b7280;font-weight:400;">/100 · ${escapeHtml(bandLabelForEmail(weakest.band).label)} · weight ${weakest.weight}</span></p>
             <p style="margin:8px 0 0 0;font-size:13px;line-height:1.5;color:#1f2937;">${escapeHtml(stripCitationMarkers(weakest.verdict))}</p>
             ${weakest.gaps[0] ? `<p style="margin:8px 0 0 0;font-size:12px;color:#b91c1c;">Gap: ${escapeHtml(stripCitationMarkers(weakest.gaps[0]))}</p>` : ""}
             <p style="margin:8px 0 0 0;font-size:12px;color:#0b0f1a;"><strong>Next action:</strong> ${escapeHtml(stripCitationMarkers(weakest.nextAction.title))} — expected lift +${weakest.nextAction.expectedLift} SVI</p>
             ${img(images.weakest, weakest.primaryVisual.a11y.title, 480)}
           </td>
         </tr>
       </table>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:20px;background:#f7f8fa;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;">
    <p style="margin:0 0 8px 0;font-size:11px;color:#6b7280;letter-spacing:.14em;text-transform:uppercase;font-weight:600;">Your Trusted Business Report is ready</p>
    <h1 style="margin:0 0 4px 0;font-size:16px;color:#0b0f1a;font-weight:700;">${escapeHtml(c.startupName)}</h1>
    <p style="margin:0 0 12px 0;font-size:12px;color:#6b7280;">${escapeHtml(meta)}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:16px 0 20px 0;">
      <tr>
        <td style="vertical-align:middle;width:130px;">${img(images.ring, `SVI ${c.svi.total}`, 120)}</td>
        <td style="vertical-align:middle;padding-left:12px;">
          <div style="font-size:44px;font-weight:800;line-height:1;color:${band.color};font-variant-numeric:tabular-nums;">${Math.round(c.svi.total)}<span style="font-size:18px;color:#6b7280;font-weight:400;">/100</span></div>
          <div style="margin-top:6px;font-size:13px;color:${band.color};font-weight:700;">${escapeHtml(band.label)}</div>
          ${delta ? `<div style="margin-top:4px;font-size:12px;color:#6b7280;">${escapeHtml(delta)}</div>` : ""}
          ${pct ? `<div style="margin-top:2px;font-size:12px;color:#6b7280;">${escapeHtml(pct)}</div>` : ""}
        </td>
        <td style="vertical-align:middle;width:170px;text-align:right;">${img(images.radar, "8 dimensions vs stage median", 160)}</td>
      </tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="6" style="width:100%;border-collapse:separate;">
      <tr>
        ${q("Where are we?", c.threeQuestions.where, EMAIL_THEME.navy)}
        ${q("What are we worth?", c.threeQuestions.worth, EMAIL_THEME.warn)}
        ${q("What next?", c.threeQuestions.next, EMAIL_THEME.success)}
      </tr>
    </table>
    ${weakestBlock}
    <p style="margin:24px 0 4px 0;font-size:13px;color:#1f2937;">Open the full interactive report in your workspace — 8 chapters, valuation range, phase gates and the 90-day plan:</p>
    <p style="margin:0 0 20px 0;"><a href="${dashboardUrl}" style="display:inline-block;padding:10px 18px;background:#1B2A5E;color:#ffffff;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600;">Open Business Report</a></p>
    ${shareUrl ? `<p style="margin:12px 0 4px 0;font-size:13px;color:#1f2937;">Public share link (send this to an investor — no login required):</p><p style="margin:0 0 20px 0;"><a href="${shareUrl}" style="color:#1d4ed8;font-size:13px;">${shareUrl}</a></p>` : ""}
    <p style="margin:20px 0 0 0;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#4b5563;">${pdfAttached ? "The PDF is attached to this email. " : ""}Directional analysis only — not a formal valuation.</p>
  </div>
  ${footerHtml ?? ""}
</body></html>`;
}

// ── Sending ─────────────────────────────────────────────────────────────────

export interface SendReportEmailResult {
  ok: boolean;
  reason?: string;
  sentTo?: string;
  shareToken?: string;
  pdfAttached?: boolean;
  /** S-R4: how the document was obtained. */
  reportSource?: "pipeline" | "stored" | "adapter" | "legacy";
  inlineImages?: number;
}

/** Legacy inputs → adapter document (the last resort). */
export function reportFromLegacyArgs(args: SendReportEmailArgs, ctx: { startupName: string; snapshotId: string | null }): ReportV2 {
  const dimStates: Record<string, SnapshotDimState> = {};
  for (const [k, v] of Object.entries(args.dimResults ?? {})) {
    dimStates[k] = { status: "complete", score: typeof v?.score === "number" ? v.score : null, insights: v?.insights ?? [], priority: v?.priority ?? null, markdown: null, marketBenchmark: null };
  }
  const criterionStates: SnapshotCriterionState[] = (args.criterionResults ?? []).map((c) => ({
    key: c.key,
    title: c.title,
    primary_dimension: c.primary_dimension,
    weight: c.weight,
    score: c.score,
    verdict: c.verdict,
    strengths: c.strengths ?? [],
    gaps: c.gaps ?? [],
    next_action: c.next_action ?? "",
  }));
  return fromSnapshot({
    snapshotId: ctx.snapshotId,
    projectId: args.projectId,
    startupName: ctx.startupName,
    industry: args.industry,
    stageLabel: args.stage,
    dimStates,
    criterionStates,
    tier: "standard",
    source: "adapter",
  });
}

async function resolveReport(args: SendReportEmailArgs, ctx: { accountId: string | null; snapshotId: string | null; startupName: string }): Promise<{ report: ReportV2; source: NonNullable<SendReportEmailResult["reportSource"]> }> {
  if (args.reportV2 && isReportV2(args.reportV2)) return { report: args.reportV2, source: "pipeline" };
  const snapId = args.snapshotId ?? ctx.snapshotId;
  if (snapId) {
    const loaded = await loadReportV2BySnapshotId(snapId, { startupName: ctx.startupName }).catch(() => null);
    if (loaded) return { report: loaded.report, source: loaded.path };
  }
  if (ctx.accountId) {
    const loaded = await loadLatestReportV2ForAccount(ctx.accountId, args.projectId, { startupName: ctx.startupName }).catch(() => null);
    if (loaded) return { report: loaded.report, source: loaded.path };
  }
  return { report: reportFromLegacyArgs(args, { startupName: ctx.startupName, snapshotId: ctx.snapshotId }), source: "legacy" };
}

/** Best-effort PNGs for the three inlined visuals (null entries when the rasteriser is missing). */
export async function inlineVisuals(report: ReportV2): Promise<{ images: ReportEmailImages; attachments: Array<{ filename: string; content: Buffer; contentType: string; cid: string }> }> {
  const ring = report.cover.visuals.find((v) => v.kind === "score_ring") ?? null;
  const radar = report.cover.visuals.find((v) => v.kind === "radar") ?? null;
  const weakest = weakestChapter(report)?.primaryVisual ?? null;
  const attachments: Array<{ filename: string; content: Buffer; contentType: string; cid: string }> = [];
  const images: ReportEmailImages = { ring: null, radar: null, weakest: null };
  const one = async (spec: VisualSpecV2 | null, key: keyof ReportEmailImages, width: number) => {
    if (!spec) return;
    const r = await visualToPng(spec, { width, hideBadge: key !== "weakest" }).catch(() => null);
    if (!r?.png) return;
    const cid = `tbr-${key}-${spec.id.replace(/[^a-zA-Z0-9_-]/g, "-")}@blockid.au`;
    images[key] = cid;
    attachments.push({ filename: `${key}.png`, content: r.png, contentType: "image/png", cid });
  };
  await Promise.all([one(ring, "ring", 240), one(radar, "radar", 320), one(weakest, "weakest", 960)]);
  return { images, attachments };
}

/** The PDF: rendered in-process; falls back to the route when react-pdf throws. */
async function buildPdf(report: ReportV2, base: string, token: string | null): Promise<Buffer | null> {
  try {
    const { renderTbrPdf } = await import("@/lib/pdf/tbr-pdf");
    return (await renderTbrPdf(report)).buffer;
  } catch (err) {
    console.warn("[email-report] in-process PDF failed, trying the route", err instanceof Error ? err.message : err);
  }
  if (!token) return null;
  try {
    const res = await fetch(`${base}/api/svi/report/pdf?token=${encodeURIComponent(token)}`, { method: "GET" });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    console.warn("[wave25b:email-report] pdf fetch failed", err);
    return null;
  }
}

export async function sendReportEmail(args: SendReportEmailArgs): Promise<SendReportEmailResult> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "supabase_unavailable" };

  // Resolve recipient email + a startup label from app_users / svi_accounts.
  const { data: appUser } = await supabase.from("app_users").select("email, startup_name").eq("id", args.userId).maybeSingle();
  const email = (appUser?.email as string | undefined)?.trim();
  if (!email) return { ok: false, reason: "no_email" };

  let startupName = (appUser?.startup_name as string | undefined) ?? "";
  if (!startupName) {
    const { data: acc } = await supabase.from("svi_accounts").select("startup_name").eq("user_id", args.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    startupName = (acc?.startup_name as string | undefined) ?? "Your Startup";
  }

  // Resolve svi_account_id for scoping the snapshot lookup.
  const { data: account } = await supabase.from("svi_accounts").select("id").eq("user_id", args.userId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const accountId = (account?.id as string | undefined) ?? null;

  // Locate the most-recent snapshot (what /tbr/[token] renders from). Mint a
  // share token if one is not yet set so the email can carry a URL + PDF.
  let shareToken: string | null = null;
  let snapshotId: string | null = args.snapshotId ?? null;
  let alreadySent = false;
  if (accountId) {
    let q = supabase.from("svi_snapshots").select("id, report_share_token, report_email_sent_at").eq("account_id", accountId).order("created_at", { ascending: false }).limit(1);
    if (snapshotId) q = q.eq("id", snapshotId);
    else if (args.projectId) q = q.eq("project_id", args.projectId);
    const { data: snap } = await q.maybeSingle();
    if (snap) {
      snapshotId = (snap as { id: string }).id;
      shareToken = (snap as { report_share_token: string | null }).report_share_token ?? null;
      alreadySent = Boolean((snap as { report_email_sent_at: string | null }).report_email_sent_at);
    }
  }
  if (alreadySent) return { ok: true, reason: "already_sent", sentTo: email };

  if (snapshotId && !shareToken) {
    const token = nanoid(24);
    const { error: upErr } = await supabase.from("svi_snapshots").update({ report_share_token: token }).eq("id", snapshotId);
    if (!upErr) shareToken = token;
  }

  const base = baseUrl(args.baseUrl);
  const dashboardUrl = `${base}/workspace/reports/business${args.projectId ? `?pid=${encodeURIComponent(args.projectId)}` : ""}`;
  const shareUrl = shareToken ? `${base}/tbr/${shareToken}` : null;

  const { report, source } = await resolveReport(args, { accountId, snapshotId, startupName });
  const totalSvi = Math.round(report.cover.svi.total);
  const bnd = bandLabelForEmail(report.cover.svi.band);

  const { images, attachments } = await inlineVisuals(report);
  const pdf = await buildPdf(report, base, shareToken);
  const pdfAttached = !!pdf;
  const allAttachments = [
    ...attachments,
    ...(pdf ? [{ filename: "BlockID-Business-Report.pdf", content: pdf, contentType: "application/pdf" }] : []),
  ];

  const { unsubscribeUrl, footerHtml } = await complianceFooter(email);
  const html = renderReportEmailHtml({ report, dashboardUrl, shareUrl, images, footerHtml, pdfAttached });

  const result = await sendEmail({
    to: email,
    subject: `Your Trusted Business Report is ready — SVI ${totalSvi}/100 (${bnd.label})`,
    html,
    attachments: allAttachments.length ? allAttachments : undefined,
    unsubscribeUrl,
  });

  if (result.ok && snapshotId) {
    // Stamp idempotency marker so a retriggered run doesn't re-send.
    await supabase.from("svi_snapshots").update({ report_email_sent_at: new Date().toISOString() }).eq("id", snapshotId);
  }

  return {
    ok: result.ok,
    reason: result.ok ? undefined : (("reason" in result ? result.reason : "send_failed") as string),
    sentTo: email,
    shareToken: shareToken ?? undefined,
    pdfAttached,
    reportSource: source,
    inlineImages: attachments.length,
  };
}
