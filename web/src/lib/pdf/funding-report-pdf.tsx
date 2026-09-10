/**
 * Money Finder report PDF (T0244, plan §4e) — `@react-pdf/renderer`, same
 * pattern as accelerator-apply-pdf.tsx. A4:
 *
 *   1. cover — startup summary, state / stage, generated + verified dates,
 *      headline numbers, "your next 3 actions"
 *   2. ranked grants table (rank · grant · A$ · deadline rung · fit · checklist)
 *   3. programs table
 *   4. 12-month timeline as a month grid — react-pdf cannot render the SVG
 *      Gantt component, so bars are `View`s with percentage widths
 *   5. narrative (plain paragraphs) + FUNDING_DISCLAIMER
 *
 * Deadline rungs and dates come from lib/funding/deadline-status so the PDF
 * and the page never disagree.
 */
import * as React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { FUNDING_DISCLAIMER, type TimelineItem } from "@/lib/agents/grant-advisor";
import type { PublicFundingReport } from "@/lib/funding/reports";
import { INTAKE_STAGES, NOT_INCORPORATED, STATE_OPTIONS } from "@/lib/funding/intake";
import { formatAudCompact, formatAudRange, programTypeLabel } from "@/lib/funding/directory";
import { DEADLINE_LABELS, deadlineStatus, formatDateAu, formatDateTimeAu, type DeadlineStatus } from "@/lib/funding/deadline-status";
import { GANTT_KINDS, ganttWindow, layoutBars } from "@/lib/funding/gantt-layout";

const C = {
  ink900: "#0F172A",
  ink700: "#334155",
  ink500: "#64748B",
  ink400: "#94A3B8",
  surface200: "#E2E8F0",
  surface100: "#F1F5F9",
  brand600: "#2563EB",
  brand50: "#EFF6FF",
  white: "#FFFFFF",
  bull: "#047857",
  warn: "#B45309",
  bear: "#B91C1C",
};

const RUNG_COLOR: Record<DeadlineStatus, string> = {
  future: C.brand600,
  open: C.bull,
  closing_soon: C.warn,
  last_call: C.bear,
  overdue: C.ink400,
};

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 9.5, color: C.ink700, backgroundColor: C.white, paddingHorizontal: 42, paddingVertical: 40 },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14, borderBottomWidth: 1, borderBottomColor: C.surface200, paddingBottom: 8 },
  brand: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.brand600 },
  subtitle: { fontSize: 8, color: C.ink400, marginTop: 2 },
  h1: { fontSize: 20, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 6 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", color: C.ink900, marginBottom: 8, marginTop: 4 },
  p: { fontSize: 9.5, lineHeight: 1.5, color: C.ink700 },
  small: { fontSize: 8, color: C.ink500 },
  metaRow: { flexDirection: "row", gap: 8, marginTop: 14, marginBottom: 14 },
  metaCell: { flex: 1, padding: 8, backgroundColor: C.surface100, borderRadius: 4 },
  metaLabel: { fontSize: 7.5, color: C.ink500, textTransform: "uppercase", letterSpacing: 0.5 },
  metaValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: C.ink900, marginTop: 2 },
  actionBox: { borderLeftWidth: 3, borderLeftColor: C.brand600, backgroundColor: C.brand50, padding: 8, marginBottom: 6, borderRadius: 3 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.surface200, paddingVertical: 5 },
  th: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.ink500, textTransform: "uppercase" },
  td: { fontSize: 9, color: C.ink700 },
  tdStrong: { fontSize: 9.5, fontFamily: "Helvetica-Bold", color: C.ink900 },
  rung: { fontSize: 7.5, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  check: { fontSize: 8, color: C.ink500, marginTop: 2 },
  ganttHead: { flexDirection: "row", marginBottom: 4 },
  ganttRow: { flexDirection: "row", alignItems: "center", height: 16 },
  ganttLabel: { width: 130, fontSize: 8, color: C.ink900, paddingRight: 6 },
  ganttTrack: { flex: 1, height: 10, backgroundColor: C.surface100, borderRadius: 3, position: "relative" },
  ganttBar: { position: "absolute", top: 0, height: 10, borderRadius: 3 },
  legend: { flexDirection: "row", gap: 10, marginTop: 8 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 3, fontSize: 8, color: C.ink500 },
  swatch: { width: 7, height: 7, borderRadius: 1.5 },
  disclaimer: { fontSize: 7.5, color: C.ink500, fontStyle: "italic", marginTop: 16, paddingTop: 8, borderTopWidth: 0.5, borderTopColor: C.surface200, lineHeight: 1.4 },
  footer: { position: "absolute", bottom: 22, left: 42, right: 42, fontSize: 7.5, color: C.ink400, flexDirection: "row", justifyContent: "space-between" },
});

export interface FundingReportPdfInput {
  report: PublicFundingReport;
  /** Startup / project name for the cover; falls back to the intake description. */
  startupName?: string | null;
  /** Latest catalogue `last_verified_at` across the matched rows. */
  verifiedAt?: string | null;
}

function stateOf(r: PublicFundingReport): string | null {
  const i = r.intake;
  if (!i) return null;
  return i.state === NOT_INCORPORATED ? i.based_state ?? null : i.state;
}

function Footer({ label }: { label: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>BlockID.au · Money Finder report · {label}</Text>
      <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
    </View>
  );
}

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={s.header}>
      <View>
        <Text style={s.brand}>BlockID.au</Text>
        <Text style={s.subtitle}>{sub}</Text>
      </View>
      <Text style={{ fontSize: 8, color: C.ink400, textAlign: "right" }}>{title}</Text>
    </View>
  );
}

export function FundingReportPDF({ input }: { input: FundingReportPdfInput }) {
  const r = input.report;
  const st = stateOf(r);
  const today = r.meta?.today ? new Date(`${r.meta.today}T00:00:00Z`) : new Date(r.created_at);
  const name = input.startupName?.trim() || (r.intake?.description ?? "Your startup").slice(0, 80);
  const stateLabel = r.intake
    ? r.intake.state === NOT_INCORPORATED
      ? "Not incorporated yet"
      : STATE_OPTIONS.find((o) => o.value === r.intake!.state)?.label ?? r.intake.state
    : "—";
  const stageLabel = r.intake ? INTAKE_STAGES.find((x) => x.value === r.intake!.stage)?.label ?? r.intake.stage : "—";
  const generated = formatDateTimeAu(r.meta?.generated_at ?? r.created_at, st);
  const verified = formatDateAu(input.verifiedAt ?? null, st, { withZone: false });
  const actions = (r.meta?.actions ?? []).slice(0, 3);
  const summary = r.meta?.summary;
  const label = name.length > 40 ? `${name.slice(0, 39)}…` : name;
  const { months } = ganttWindow(today);
  const { bars, hidden } = layoutBars(r.timeline, today, 30);
  const narrative = (r.narrative_md ?? "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/^#+\s*/gm, "").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^[-*]\s+/gm, "• ").trim())
    .filter(Boolean);

  return (
    <Document title={`${name} — Money Finder report`} author="BlockID.au">
      {/* 1. Cover */}
      <Page size="A4" style={s.page}>
        <Header title={generated} sub="Money Finder report · grants, programs and a 12-month plan" />
        <Text style={s.h1}>{name}</Text>
        {r.intake ? <Text style={[s.p, { marginTop: 6 }]}>{r.intake.description}</Text> : null}
        <View style={s.metaRow}>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Registered in</Text>
            <Text style={s.metaValue}>{stateLabel}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Stage</Text>
            <Text style={s.metaValue}>{stageLabel}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Grants matched</Text>
            <Text style={s.metaValue}>{summary?.grant_count ?? r.grants.length}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Programs matched</Text>
            <Text style={s.metaValue}>{summary?.program_count ?? r.programs.length}</Text>
          </View>
        </View>
        {summary && summary.top_grants_amount_max_aud > 0 ? (
          <Text style={s.p}>
            Up to {formatAudCompact(summary.top_grants_amount_max_aud)} across the top five grants
            {summary.timeline_count ? ` · ${summary.timeline_count} dated actions over the next 12 months` : ""}.
          </Text>
        ) : null}
        <Text style={[s.small, { marginTop: 6 }]}>Generated {generated} · catalogue verified as of {verified}</Text>

        {actions.length ? (
          <View style={{ marginTop: 18 }}>
            <Text style={s.h2}>Your next 3 actions</Text>
            {actions.map((a, i) => (
              <View key={a} style={s.actionBox}>
                <Text style={s.p}>
                  {i + 1}. {a}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
        <Footer label={label} />
      </Page>

      {/* 2. Grants */}
      <Page size="A4" style={s.page}>
        <Header title="Grants, ranked" sub={name} />
        <Text style={s.h2}>Grants, ranked by fit</Text>
        {r.grants.length === 0 ? <Text style={s.p}>No grant passed every hard gate for this profile.</Text> : null}
        <View style={s.row}>
          <Text style={[s.th, { width: 22 }]}>#</Text>
          <Text style={[s.th, { flex: 3 }]}>Grant</Text>
          <Text style={[s.th, { flex: 2 }]}>Amount</Text>
          <Text style={[s.th, { flex: 2 }]}>Deadline</Text>
          <Text style={[s.th, { width: 34, textAlign: "right" }]}>Fit</Text>
        </View>
        {r.grants.map((g, i) => {
          const v = deadlineStatus(
            {
              opens_at: g.next_window.opens_at ?? g.grant.opens_at,
              closes_at: g.next_window.closes_at ?? g.grant.closes_at,
              rolling: g.next_window.kind === "rolling",
              catalogue_status: g.effective_status,
            },
            today,
          );
          const checks = g.eligibility_checklist
            .map((c) => `${c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : "?"} ${c.label}`)
            .join("   ");
          return (
            <View key={g.ref_id} style={s.row} wrap={false}>
              <Text style={[s.td, { width: 22 }]}>{i + 1}</Text>
              <View style={{ flex: 3, paddingRight: 6 }}>
                <Text style={s.tdStrong}>{g.name}</Text>
                {g.why[0] ? <Text style={s.check}>Why you: {g.why[0]}</Text> : null}
                {checks ? <Text style={s.check}>{checks}</Text> : null}
                <Text style={[s.check, { color: C.brand600 }]}>{g.grant.official_url}</Text>
              </View>
              <View style={{ flex: 2, paddingRight: 6 }}>
                <Text style={s.td}>{formatAudRange(g.grant.amount_min_aud, g.grant.amount_max_aud, g.grant.amount_note)}</Text>
                {typeof g.estimate_aud === "number" ? <Text style={s.check}>est. {formatAudCompact(g.estimate_aud)} for you</Text> : null}
              </View>
              <View style={{ flex: 2, paddingRight: 6 }}>
                <Text style={[s.rung, { color: RUNG_COLOR[v.status] }]}>{DEADLINE_LABELS[v.status]}</Text>
                <Text style={s.check}>{v.label}</Text>
              </View>
              <Text style={[s.tdStrong, { width: 34, textAlign: "right" }]}>{g.score}</Text>
            </View>
          );
        })}
        <Footer label={label} />
      </Page>

      {/* 3. Programs */}
      <Page size="A4" style={s.page}>
        <Header title="Programs" sub={name} />
        <Text style={s.h2}>Programs</Text>
        {r.programs.length === 0 ? <Text style={s.p}>No program matched this stage and location.</Text> : null}
        <View style={s.row}>
          <Text style={[s.th, { width: 22 }]}>#</Text>
          <Text style={[s.th, { flex: 3 }]}>Program</Text>
          <Text style={[s.th, { flex: 2 }]}>Terms</Text>
          <Text style={[s.th, { flex: 2 }]}>Deadline</Text>
          <Text style={[s.th, { width: 34, textAlign: "right" }]}>Fit</Text>
        </View>
        {r.programs.map((p, i) => {
          const v = deadlineStatus(
            {
              opens_at: p.next_window.opens_at ?? p.program.applications_open,
              closes_at: p.next_window.closes_at ?? p.program.applications_close,
              rolling: p.next_window.kind === "rolling",
              catalogue_status: p.effective_status,
            },
            today,
          );
          return (
            <View key={p.ref_id} style={s.row} wrap={false}>
              <Text style={[s.td, { width: 22 }]}>{i + 1}</Text>
              <View style={{ flex: 3, paddingRight: 6 }}>
                <Text style={s.tdStrong}>{p.name}</Text>
                <Text style={s.check}>
                  {programTypeLabel(p.program.program_type)} · {p.program.city}
                </Text>
                {p.why[0] ? <Text style={s.check}>Why you: {p.why[0]}</Text> : null}
                <Text style={[s.check, { color: C.brand600 }]}>{p.program.official_url}</Text>
              </View>
              <Text style={[s.td, { flex: 2, paddingRight: 6 }]}>
                {p.program.funding_aud ? `${formatAudCompact(p.program.funding_aud)} funding` : "No cash"}
                {p.program.equity_pct ? ` · ${p.program.equity_pct} equity` : ""}
                {p.program.length_weeks ? ` · ${p.program.length_weeks} wks` : ""}
              </Text>
              <View style={{ flex: 2, paddingRight: 6 }}>
                <Text style={[s.rung, { color: RUNG_COLOR[v.status] }]}>{DEADLINE_LABELS[v.status]}</Text>
                <Text style={s.check}>{v.label}</Text>
              </View>
              <Text style={[s.tdStrong, { width: 34, textAlign: "right" }]}>{p.score}</Text>
            </View>
          );
        })}
        <Footer label={label} />
      </Page>

      {/* 4. Timeline */}
      <Page size="A4" style={s.page}>
        <Header title="12-month timeline" sub={name} />
        <Text style={s.h2}>12-month timeline</Text>
        {bars.length === 0 ? (
          <Text style={s.p}>Nothing dated in the next twelve months — rolling schemes can be lodged any time.</Text>
        ) : (
          <View>
            <View style={s.ganttHead}>
              <Text style={s.ganttLabel} />
              <View style={{ flex: 1, flexDirection: "row" }}>
                {months.map((m) => (
                  <Text key={m.key} style={[s.th, { flex: 1, textAlign: "center", fontSize: 6.5 }]}>
                    {m.label}
                  </Text>
                ))}
              </View>
            </View>
            {bars.map((b) => {
              const kind = GANTT_KINDS.find((k) => k.kind === b.item.kind) ?? GANTT_KINDS[0];
              const left = (b.x0 / 12) * 100;
              const w = Math.max(2, ((b.x1 - b.x0) / 12) * 100);
              return (
                <View key={`${b.item.ref_id}-${b.row}`} style={s.ganttRow} wrap={false}>
                  <Text style={s.ganttLabel}>{b.item.name.length > 30 ? `${b.item.name.slice(0, 29)}…` : b.item.name}</Text>
                  <View style={s.ganttTrack}>
                    <View style={[s.ganttBar, { left: `${left}%`, width: `${w}%`, backgroundColor: kind.light }]} />
                  </View>
                </View>
              );
            })}
            <View style={s.legend}>
              {GANTT_KINDS.map((k) => (
                <View key={k.kind} style={s.legendItem}>
                  <View style={[s.swatch, { backgroundColor: k.light }]} />
                  <Text>{k.label}</Text>
                </View>
              ))}
            </View>
            {hidden > 0 ? <Text style={[s.small, { marginTop: 4 }]}>+{hidden} more actions listed below.</Text> : null}
          </View>
        )}

        <Text style={[s.h2, { marginTop: 16 }]}>Month by month</Text>
        {timelineByMonth(r.timeline).map(([month, items]) => (
          <View key={month} style={{ marginBottom: 6 }} wrap={false}>
            <Text style={s.tdStrong}>{monthTitle(month)}</Text>
            {items.map((it, i) => (
              <Text key={`${it.ref_id}-${i}`} style={[s.td, { marginLeft: 8, marginTop: 1 }]}>
                • {it.name} — {it.action}
                {it.lead_time_days ? ` (${it.lead_time_days} days lead)` : ""}
                {it.deadline ? ` · deadline ${formatDateAu(it.deadline, st)}` : ""}
              </Text>
            ))}
          </View>
        ))}
        <Footer label={label} />
      </Page>

      {/* 5. Narrative + disclaimer */}
      <Page size="A4" style={s.page}>
        <Header title="Your plan" sub={name} />
        <Text style={s.h2}>Your plan, in plain English</Text>
        {narrative.length ? (
          narrative.map((p, i) => (
            <Text key={i} style={[s.p, { marginBottom: 6 }]}>
              {p}
            </Text>
          ))
        ) : (
          <Text style={s.p}>Narrative not generated for this report.</Text>
        )}
        <Text style={s.disclaimer}>{FUNDING_DISCLAIMER}</Text>
        <Text style={[s.small, { marginTop: 6 }]}>
          Grant information is free from government; this report is BlockID&apos;s analysis against your profile. Confirm every date on the official portal before you apply.
        </Text>
        <Footer label={label} />
      </Page>
    </Document>
  );
}

function timelineByMonth(items: TimelineItem[]): Array<[string, TimelineItem[]]> {
  const map = new Map<string, TimelineItem[]>();
  for (const it of [...items].sort((a, b) => (a.month < b.month ? -1 : a.month > b.month ? 1 : 0))) {
    const list = map.get(it.month) ?? [];
    list.push(it);
    map.set(it.month, list);
  }
  return Array.from(map.entries());
}

function monthTitle(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-AU", { month: "long", year: "numeric", timeZone: "UTC" });
}

export async function renderFundingReportPdf(input: FundingReportPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<FundingReportPDF input={input} />);
  return buf as Buffer;
}

/** File name used by both the download route and the data-room save. */
export function fundingReportFilename(reportId: string): string {
  return `money-finder-report-${reportId.slice(0, 8)}.pdf`;
}
