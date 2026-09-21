// Wave 25 Phase B → S-R4 → G27 — auto-email the Trusted Business Report to
// the founder, rendered from `ReportV2` (spec §A: every surface renders from
// the one document). G27 (docs/design/tbr-v3-investor-report-spec.md § 6):
// the e-mail body IS the 1-page investment view — the same numbers the web
// dashboard, PDF and DOCX print, from the same view-models
// (`lib/report-v2/investment-view.ts` + `dashboard-view.ts`).
//
// Called fire-and-forget from the report pipeline after a full run. Sends
// an HTML email (+ a plain-text twin, `reportEmailSummary`) with:
//   - intro line (`emailIntro`)
//   - the four dashboard tiles as a 2×2 table (SVI index · evidence
//     confidence · verdict band · valuation range)
//   - the 8-dimension bar chart, inlined as a CID PNG when the rasteriser
//     is available (skipped otherwise — the numbers are in the tiles)
//   - the verdict block: band letter + label + rubric wording + conviction
//     line + the verbatim sub-line; Conditions (band B / C) or the evidence
//     CTAs with absolute links (band D); band A prints no conditions
//   - the 5 key points; the weakest chapter's visual beneath them (optional)
//   - the top 3 improvements (action · +lift SVI · window)
//   - CTA `emailOpenFull` → /workspace/reports/business + the public
//     /tbr/<token> link when present
//   - the PDF attached, rendered in-process by `lib/pdf/tbr-pdf.tsx`
//     (falls back to fetching /api/svi/report/pdf)
//
// Every label comes from `lib/i18n/tbr-v3-strings.ts` (EN / VI, never
// hard-coded); locale = `report.locale`. Inline styles only (e-mail), light
// palette (ink #1F2937 · navy #1B2A5E · cyan #0891B2 · sunken #F7F8FA),
// tabular numbers, no colour-only meaning. Never-say safe by construction
// (docs/design/messaging.md § 11) — pinned in email-report.test.ts.
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
import { EMAIL_THEME } from "@/lib/email/theme";
import { sendEmail, complianceFooter } from "@/lib/email";
import { getSupabaseAdmin } from "@/lib/supabase";
import { stripCitationMarkers } from "@/lib/report-v2/citations";
import type { CriterionResult } from "@/lib/report-pipeline/run-report-pipeline";
import { fromSnapshot, type SnapshotCriterionState, type SnapshotDimState } from "@/lib/report-v2/adapter";
import { loadLatestReportV2ForAccount, loadReportV2BySnapshotId } from "@/lib/report-v2/load";
import { isReportV2, type DimensionChapter, type InvestmentView, type ReportV2 } from "@/lib/report-v2/schema";
import { investmentLocale, investmentViewFor, type InvestmentLocale } from "@/lib/report-v2/investment-view";
import { buildDashboardView, type DashboardView } from "@/lib/report-v2/dashboard-view";
import { getTbrV3Strings, type TbrV3Strings } from "@/lib/i18n/tbr-v3-strings";
import { getTbrStrings } from "@/lib/i18n/tbr-strings";
import { alignReportWithAssessmentCard, type AssessmentCardData, type AssessmentCardOptions } from "@/lib/svi/assessment-card";
import { visualToPng } from "@/lib/report-visuals/png";
import type { Band, VisualSpecV2 } from "@/lib/report-visuals/types";
import { GROWTH_PHASE_LABELS } from "@/lib/growth/phase-taxonomy";

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
  /** G27: server-side Assessment Card context (stored evidence confidence / unverified claims) when the caller has it. */
  assessment?: AssessmentCardOptions;
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

// ── G27 view-model ──────────────────────────────────────────────────────────

export interface ReportEmailContext {
  /** The document aligned with the Assessment Card (EC is the one number). */
  report: ReportV2;
  card: AssessmentCardData;
  view: InvestmentView;
  dash: DashboardView;
  t: TbrV3Strings;
  locale: InvestmentLocale;
}

/**
 * Align → investment view → dashboard view, once, for every e-mail surface
 * (HTML, text twin, inline chart). When the stored document already carries
 * an `investmentView`, its evidence confidence / unverified count seed the
 * card so the e-mail prints the numbers the web printed.
 */
export function reportEmailContext(report: ReportV2, opts?: AssessmentCardOptions): ReportEmailContext {
  const stored = report.investmentView;
  const cardOpts: AssessmentCardOptions = opts ?? (stored ? { evidenceConfidence: stored.evidenceConfidence, unverifiedMaterialClaims: stored.unverifiedClaims } : {});
  const locale = investmentLocale(report.locale);
  const aligned = alignReportWithAssessmentCard(report, cardOpts);
  const view = investmentViewFor(aligned.report, aligned.card, locale);
  const dash = buildDashboardView(aligned.report, aligned.card, view, locale);
  return { report: aligned.report, card: aligned.card, view, dash, t: getTbrV3Strings(locale), locale };
}

// ── HTML ────────────────────────────────────────────────────────────────────

export interface ReportEmailImages {
  /** `cid:` references (without the prefix) for the inlined PNGs; null = not inlined. */
  chart: string | null;
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
  /** Server-side card context (stored EC / unverified claims); defaults to the stored investment view's numbers. */
  assessment?: AssessmentCardOptions;
  /** Origin for relative CTA hrefs; defaults to the dashboard URL's origin. */
  baseUrl?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Light palette (spec § 5) — inline only, e-mail clients ignore stylesheets. */
// G26 lane R: every colour from the one e-mail theme (light card, navy headings, ink body).
const INK = EMAIL_THEME.inkMuted;
const NAVY = EMAIL_THEME.navy;
const CYAN = EMAIL_THEME.action; // links: cyan is 3.7:1 (decorative only), the action blue is the text-safe accent
const SUNKEN = EMAIL_THEME.sunken;
const MUTED = EMAIL_THEME.inkSubtle;
const LINE = EMAIL_THEME.border;
const MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
const NUM = `font-family:${MONO};font-variant-numeric:tabular-nums;`;

const img = (cid: string | null | undefined, alt: string, width: number) =>
  cid ? `<img src="cid:${cid}" alt="${escapeHtml(alt)}" width="${width}" style="display:block;max-width:100%;height:auto;border:0;margin:14px 0 0 0;" />` : "";

/** Absolute URL for a CTA href (internal paths become links on the site origin). */
export function absoluteHref(href: string, base: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  return `${base.replace(/\/+$/, "")}${href.startsWith("/") ? "" : "/"}${href}`;
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return baseUrl();
  }
}

// Review v3.26.0 P1: an `[unevidenced]` claim keeps an "(unverified)" suffix on the marker-free e-mail surface.
const clean = (s: string) => {
  const flagged = /\[(?:unevidenced|uncited)\]/i.test(s);
  const out = stripCitationMarkers(s).replace(/\s+/g, " ").trim();
  return flagged && out ? `${out} (unverified)` : out;
};

function h2(label: string): string {
  return `<p style="margin:22px 0 8px 0;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:${NAVY};font-weight:700;">${escapeHtml(label)}</p>`;
}

function tileCell(tile: DashboardView["tiles"][number]): string {
  return `<td width="50%" style="vertical-align:top;padding:12px 14px;background:${SUNKEN};border:1px solid ${LINE};border-radius:8px;">
      <p style="margin:0 0 4px 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:${MUTED};font-weight:700;">${escapeHtml(tile.label)}</p>
      <p style="margin:0;font-size:26px;line-height:1.1;font-weight:700;color:${INK};${NUM}">${escapeHtml(tile.value)}</p>
      <p style="margin:6px 0 0 0;font-size:13px;line-height:1.4;color:${INK};">${escapeHtml(tile.sub)}</p>
      ${tile.note ? `<p style="margin:2px 0 0 0;font-size:12px;line-height:1.4;color:${MUTED};">${escapeHtml(tile.note)}</p>` : ""}
    </td>`;
}

/** Pure: the email body for a ReportV2 (tested without SMTP). */
export function renderReportEmailHtml(input: RenderReportEmailInput): string {
  const { dashboardUrl, shareUrl, images = {}, footerHtml, pdfAttached = true } = input;
  const base = input.baseUrl ?? originOf(dashboardUrl);
  const { report, view, dash, t, locale } = reportEmailContext(input.report, input.assessment);
  const c = report.cover;
  const s = getTbrStrings(locale);
  const phase = GROWTH_PHASE_LABELS[c.phaseId]?.[locale] ?? c.phaseId;
  const meta = [c.sector, c.stageLabel, phase].filter(Boolean).join(" · ");
  const [svi, evidence, verdict, valuation] = dash.tiles;
  const weakest = weakestChapter(report);

  const conditionsBlock =
    view.band === "D"
      ? `${h2(t.evidenceCtas)}
       <ul style="margin:0;padding:0 0 0 18px;font-size:13px;line-height:1.55;color:${INK};">
         ${view.evidenceCtas.map((cta) => `<li style="margin:0 0 4px 0;"><a href="${escapeHtml(absoluteHref(cta.href, base))}" style="color:${CYAN};text-decoration:underline;">${escapeHtml(cta.label)}</a>${typeof cta.lift === "number" ? ` <span style="${NUM}color:${MUTED};">(${escapeHtml(t.lift(cta.lift))})</span>` : ""}</li>`).join("\n         ")}
       </ul>`
      : view.conditions.length > 0
        ? `${h2(t.conditions)}
       <ol style="margin:0;padding:0 0 0 18px;font-size:13px;line-height:1.55;color:${INK};">
         ${view.conditions.map((cond) => `<li style="margin:0 0 4px 0;">${escapeHtml(cond.text)}</li>`).join("\n         ")}
       </ol>`
        : "";

  const improvements = view.improvementPlan.slice(0, 3);
  const improvementsBlock = improvements.length
    ? `${h2(t.emailImprovements)}
       <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:13px;color:${INK};">
         <tr>
           <th align="left" style="padding:6px 8px;border-bottom:1px solid ${LINE};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(t.thAction)}</th>
           <th align="right" style="padding:6px 8px;border-bottom:1px solid ${LINE};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(t.thLift)}</th>
           <th align="left" style="padding:6px 8px;border-bottom:1px solid ${LINE};font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${MUTED};">${escapeHtml(t.thWindow)}</th>
         </tr>
         ${improvements
           .map(
             (step, i) => `<tr style="background:${i % 2 === 1 ? SUNKEN : "#ffffff"};">
           <td style="padding:8px;border-bottom:1px solid ${LINE};line-height:1.45;">${step.rank}. ${escapeHtml(clean(step.title))}</td>
           <td align="right" style="padding:8px;border-bottom:1px solid ${LINE};${NUM}white-space:nowrap;">${escapeHtml(t.lift(step.expectedLift))}</td>
           <td style="padding:8px;border-bottom:1px solid ${LINE};white-space:nowrap;">${escapeHtml(t.window[step.window])}</td>
         </tr>`,
           )
           .join("\n         ")}
       </table>
       <p style="margin:6px 0 0 0;font-size:11px;color:${MUTED};">${escapeHtml(t.planNote)}</p>`
    : "";

  return `<!doctype html>
<html><body style="margin:0;padding:20px;background:${SUNKEN};color:${INK};font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:24px;">
    <p style="margin:0 0 8px 0;font-size:11px;color:${MUTED};letter-spacing:.14em;text-transform:uppercase;font-weight:600;">Your Trusted Business Report is ready</p>
    <h1 style="margin:0 0 4px 0;font-size:20px;color:${NAVY};font-weight:700;">${escapeHtml(c.startupName)}</h1>
    <p style="margin:0 0 12px 0;font-size:12px;color:${MUTED};">${escapeHtml(meta)}</p>
    <p style="margin:0 0 16px 0;font-size:14px;line-height:1.55;color:${INK};">${escapeHtml(t.emailIntro(c.startupName))}</p>
    <table role="presentation" cellpadding="0" cellspacing="8" style="width:100%;border-collapse:separate;">
      <tr>${tileCell(svi)}${tileCell(evidence)}</tr>
      <tr>${tileCell(verdict)}${tileCell(valuation)}</tr>
    </table>
    ${img(images.chart, dash.chart.a11y.title, 600)}
    ${images.chart ? `<p style="margin:4px 0 0 0;font-size:11px;color:${MUTED};">${escapeHtml(dash.chartCaption)}</p>` : ""}
    ${h2(t.sec.investmentView)}
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-left:4px solid ${NAVY};background:${SUNKEN};border-radius:0 8px 8px 0;">
      <tr>
        <td style="padding:14px 16px;vertical-align:top;">
          <p style="margin:0;font-size:32px;line-height:1;font-weight:700;color:${INK};${NUM}">${view.band}<span style="font-size:15px;font-weight:700;margin-left:10px;font-family:ui-sans-serif,system-ui,sans-serif;">${escapeHtml(view.bandLabel)}</span></p>
          <p style="margin:8px 0 0 0;font-size:14px;line-height:1.5;color:${INK};font-weight:600;">${escapeHtml(view.bandWording)}</p>
          <p style="margin:6px 0 0 0;font-size:13px;line-height:1.5;color:${INK};${NUM}">${escapeHtml(view.convictionLine)}</p>
          <p style="margin:8px 0 0 0;font-size:12px;line-height:1.5;color:${MUTED};">${escapeHtml(view.subline)}</p>
        </td>
      </tr>
    </table>
    ${conditionsBlock}
    ${h2(t.sec.keyPoints)}
    <ol style="margin:0;padding:0 0 0 18px;font-size:13px;line-height:1.55;color:${INK};">
      ${view.keyPoints.map((kp) => `<li style="margin:0 0 5px 0;">${escapeHtml(clean(kp))}</li>`).join("\n      ")}
    </ol>
    ${weakest ? img(images.weakest, weakest.primaryVisual.a11y.title, 600) : ""}
    ${improvementsBlock}
    <p style="margin:26px 0 0 0;"><a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:11px 20px;background:${NAVY};color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;">${escapeHtml(t.emailOpenFull)}</a></p>
    ${shareUrl ? `<p style="margin:14px 0 0 0;font-size:13px;line-height:1.5;color:${INK};">${escapeHtml(s.shareUrlLabel)} <a href="${escapeHtml(shareUrl)}" style="color:${CYAN};text-decoration:underline;">${escapeHtml(shareUrl)}</a></p>` : ""}
    <p style="margin:20px 0 0 0;padding-top:16px;border-top:1px solid ${LINE};font-size:11px;line-height:1.5;color:${MUTED};">${pdfAttached ? "The PDF is attached to this email. " : ""}${escapeHtml(s.v2.adapter.disclaimer)}</p>
  </div>
  ${footerHtml ?? ""}
</body></html>`;
}

// ── Plain-text twin ─────────────────────────────────────────────────────────

export interface ReportEmailSummaryInput {
  dashboardUrl?: string;
  shareUrl?: string | null;
  assessment?: AssessmentCardOptions;
  baseUrl?: string;
}

/**
 * The plain-text twin of the 1-page investment view (tiles, verdict,
 * conditions / CTAs, key points, improvements, links) — the `text` part of
 * the multipart send and the assertion surface for tests.
 */
export function reportEmailSummary(reportIn: ReportV2, localeIn?: string, input: ReportEmailSummaryInput = {}): string {
  const source = localeIn && investmentLocale(localeIn) !== investmentLocale(reportIn.locale) ? { ...reportIn, locale: investmentLocale(localeIn) } : reportIn;
  const { report, view, dash, t } = reportEmailContext(source, input.assessment);
  const base = input.baseUrl ?? (input.dashboardUrl ? originOf(input.dashboardUrl) : baseUrl());
  const lines: string[] = [];
  lines.push(report.cover.startupName, t.emailIntro(report.cover.startupName), "");
  for (const tile of dash.tiles) lines.push(`${tile.label}: ${tile.value} · ${tile.sub}${tile.note ? ` · ${tile.note}` : ""}`);
  lines.push("", `${t.sec.investmentView}: ${view.band} — ${view.bandLabel}`, view.bandWording, view.convictionLine, view.subline);
  if (view.band === "D") {
    lines.push("", t.evidenceCtas);
    for (const cta of view.evidenceCtas) lines.push(`- ${cta.label}${typeof cta.lift === "number" ? ` (${t.lift(cta.lift)})` : ""}: ${absoluteHref(cta.href, base)}`);
  } else if (view.conditions.length > 0) {
    lines.push("", t.conditions);
    view.conditions.forEach((cond, i) => lines.push(`${i + 1}. ${cond.text}`));
  }
  lines.push("", t.sec.keyPoints);
  view.keyPoints.forEach((kp, i) => lines.push(`${i + 1}. ${clean(kp)}`));
  const improvements = view.improvementPlan.slice(0, 3);
  if (improvements.length) {
    lines.push("", t.emailImprovements);
    for (const step of improvements) lines.push(`${step.rank}. ${clean(step.title)} · ${t.lift(step.expectedLift)} · ${t.window[step.window]}`);
    lines.push(t.planNote);
  }
  if (input.dashboardUrl) lines.push("", `${t.emailOpenFull} ${input.dashboardUrl}`);
  if (input.shareUrl) lines.push(input.shareUrl);
  return lines.join("\n");
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

/**
 * Best-effort PNGs for the two inlined visuals — the dashboard's 8-dimension
 * bar chart and the weakest chapter's primary (null entries when the
 * rasteriser is missing). `chart` may be passed by a caller that already
 * built the dashboard view.
 */
export async function inlineVisuals(report: ReportV2, chart?: VisualSpecV2 | null): Promise<{ images: ReportEmailImages; attachments: Array<{ filename: string; content: Buffer; contentType: string; cid: string }> }> {
  const chartSpec = chart === undefined ? reportEmailContext(report).dash.chart : chart;
  const weakest = weakestChapter(report)?.primaryVisual ?? null;
  const attachments: Array<{ filename: string; content: Buffer; contentType: string; cid: string }> = [];
  const images: ReportEmailImages = { chart: null, weakest: null };
  const one = async (spec: VisualSpecV2 | null, key: keyof ReportEmailImages, width: number) => {
    if (!spec) return;
    const r = await visualToPng(spec, { width, hideBadge: key !== "weakest" }).catch(() => null);
    if (!r?.png) return;
    const cid = `tbr-${key}-${spec.id.replace(/[^a-zA-Z0-9_-]/g, "-")}@blockid.au`;
    images[key] = cid;
    attachments.push({ filename: `${key}.png`, content: r.png, contentType: "image/png", cid });
  };
  await Promise.all([one(chartSpec, "chart", 1200), one(weakest, "weakest", 960)]);
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

  const ctx = reportEmailContext(report, args.assessment);
  const { images, attachments } = await inlineVisuals(report, ctx.dash.chart);
  const pdf = await buildPdf(report, base, shareToken);
  const pdfAttached = !!pdf;
  const allAttachments = [
    ...attachments,
    ...(pdf ? [{ filename: "BlockID-Business-Report.pdf", content: pdf, contentType: "application/pdf" }] : []),
  ];

  const { unsubscribeUrl, footerHtml } = await complianceFooter(email);
  const html = renderReportEmailHtml({ report, dashboardUrl, shareUrl, images, footerHtml, pdfAttached, assessment: args.assessment, baseUrl: base });
  const text = reportEmailSummary(report, report.locale, { dashboardUrl, shareUrl, assessment: args.assessment, baseUrl: base });

  const result = await sendEmail({
    to: email,
    subject: `Your Trusted Business Report is ready — SVI ${totalSvi}/100 (${bnd.label})`,
    html,
    text,
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
