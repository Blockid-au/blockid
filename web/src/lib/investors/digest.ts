// Weekly digest "Pipeline this week" block (S28-B).
//
// Pure: turns the project's live investor contacts + the week's
// `status_change` touchpoints into the `DigestPipelineSection` that
// lib/digest/weekly.ts puts on the payload and lib/digest/email-template.ts
// renders. No DB here — weekly.ts reads the rows; this file decides what
// they mean:
//
//   new_contacts   = live contacts created inside the digest period
//   stage_moves    = status_change touchpoints inside the period, with the
//                    contact name and from → to (auto moves included)
//   overdue        = live contacts whose next step is past due at period end
//
// The block only renders when the project has ≥ 1 contact (weekly.ts
// leaves `pipeline` undefined otherwise) — a founder who has not started a
// pipeline should not be nagged about one.
//
// Colocated tests: digest.test.ts.

import { isOverdue, STAGE_LABEL, type ContactRow, type ContactStage } from "./crm";

export interface DigestPipelineMove {
  name: string;
  from: ContactStage | null;
  to: ContactStage;
  /** "cheque signed" etc. when the system moved it. */
  auto: string | null;
}

export interface DigestPipelineOverdue {
  name: string;
  org: string | null;
  next_step: string | null;
  /** YYYY-MM-DD */
  due: string;
  days: number;
}

export interface DigestPipelineSection {
  total: number;
  new_contacts: number;
  stage_moves: DigestPipelineMove[];
  overdue: DigestPipelineOverdue[];
  /** Live contacts in committed + invested. */
  committed: number;
  /** Deep link to the board. */
  href: string;
}

export interface StageMoveRowLike {
  contact_id: string;
  occurred_at: string;
  meta: Record<string, unknown> | null;
}

const MAX_MOVES = 8;
const MAX_OVERDUE = 5;

function daysPast(due: string, at: Date): number {
  const today = new Date(`${at.toISOString().slice(0, 10)}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((today - new Date(`${due}T00:00:00Z`).getTime()) / 86_400_000));
}

function stageOf(v: unknown): ContactStage | null {
  return typeof v === "string" && v in STAGE_LABEL ? (v as ContactStage) : null;
}

export function buildDigestPipeline(
  contacts: readonly ContactRow[],
  moves: readonly StageMoveRowLike[],
  opts: { periodStart: Date; periodEnd: Date; siteBase: string },
): DigestPipelineSection {
  const live = contacts.filter((c) => !c.archived_at);
  const byId = new Map(live.map((c) => [c.id, c]));
  const startIso = opts.periodStart.toISOString();
  const endIso = opts.periodEnd.toISOString();

  const newContacts = live.filter((c) => c.created_at >= startIso && c.created_at < endIso).length;

  const stageMoves: DigestPipelineMove[] = [];
  for (const m of moves) {
    if (m.occurred_at < startIso || m.occurred_at >= endIso) continue;
    const to = stageOf(m.meta?.to);
    if (!to) continue;
    const c = byId.get(m.contact_id);
    if (!c) continue;
    stageMoves.push({ name: c.name, from: stageOf(m.meta?.from), to, auto: typeof m.meta?.auto === "string" ? m.meta.auto : null });
    if (stageMoves.length >= MAX_MOVES) break;
  }

  const overdue: DigestPipelineOverdue[] = live
    .filter((c) => isOverdue(c, opts.periodEnd))
    .map((c) => ({ name: c.name, org: c.org, next_step: c.next_step, due: c.next_step_due as string, days: daysPast(c.next_step_due as string, opts.periodEnd) }))
    .sort((a, b) => b.days - a.days)
    .slice(0, MAX_OVERDUE);

  const committed = live.filter((c) => c.stage === "committed" || c.stage === "invested").length;

  return {
    total: live.length,
    new_contacts: newContacts,
    stage_moves: stageMoves,
    overdue,
    committed,
    href: `${opts.siteBase.replace(/\/+$/, "")}/workspace/investors/pipeline`,
  };
}

/** True when the block carries something worth sending on an otherwise quiet week. */
export function hasPipelineSignal(p: DigestPipelineSection | undefined): boolean {
  return Boolean(p && (p.new_contacts > 0 || p.stage_moves.length > 0 || p.overdue.length > 0));
}

/** "3 new · 2 moved · 1 overdue" — the header line. */
export function pipelineDigestHeader(p: DigestPipelineSection): string {
  const parts = [`${p.new_contacts} new`, `${p.stage_moves.length} moved`];
  if (p.overdue.length > 0) parts.push(`${p.overdue.length} overdue`);
  return `${p.total} investor${p.total === 1 ? "" : "s"} in your pipeline — ${parts.join(" · ")}`;
}

export function describeMove(m: DigestPipelineMove): string {
  const to = STAGE_LABEL[m.to];
  const from = m.from ? STAGE_LABEL[m.from] : null;
  const base = from ? `${m.name}: ${from} → ${to}` : `${m.name} → ${to}`;
  return m.auto ? `${base} (${m.auto})` : base;
}
