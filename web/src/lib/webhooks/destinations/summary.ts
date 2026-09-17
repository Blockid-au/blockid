// G14-S38 — one human summary per webhook envelope, shared by every
// destination so Slack / Affinity / Airtable all say the same thing:
// title · startup · SVI · Δ · link · a few labelled fields. Pure.

import type { WebhookEnvelope } from "../registry";

export interface EnvelopeSummary {
  event: string;
  title: string;
  startup: string | null;
  svi: number | null;
  delta: number | null;
  link: string | null;
  /** Ordered labelled facts for the body (≤ 8, short values). */
  fields: Array<{ label: string; value: string }>;
}

const SITE = "https://blockid.au";

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function short(id: unknown): string {
  const s = str(id);
  return s ? (s.length > 12 ? `${s.slice(0, 8)}…` : s) : "—";
}

export function fmtDelta(delta: number | null): string {
  if (delta === null) return "—";
  return delta > 0 ? `+${delta}` : String(delta);
}

export function summariseEnvelope(envelope: WebhookEnvelope): EnvelopeSummary {
  const d = (envelope.data ?? {}) as unknown as Record<string, unknown>;
  const projectId = str(d.project_id);
  const base: EnvelopeSummary = { event: envelope.event, title: envelope.event, startup: null, svi: null, delta: null, link: null, fields: [] };

  switch (envelope.event) {
    case "svi.rescored": {
      const svi = num(d.svi_total);
      const delta = num(d.delta);
      return {
        ...base,
        title: "SVI rescored",
        startup: projectId ? `Project ${short(projectId)}` : null,
        svi,
        delta,
        link: projectId ? `${SITE}/workspace/svi` : null,
        fields: [
          { label: "SVI", value: svi === null ? "—" : String(Math.round(svi)) },
          { label: "Δ", value: fmtDelta(delta === null ? null : Math.round(delta)) },
          { label: "Stage", value: d.stage == null ? "—" : String(d.stage) },
          { label: "Source", value: str(d.source) ?? "—" },
        ],
      };
    }
    case "evidence.uploaded":
      return {
        ...base,
        title: "Evidence uploaded",
        startup: projectId ? `Project ${short(projectId)}` : null,
        link: projectId ? `${SITE}/workspace/evidence` : null,
        fields: [
          { label: "File", value: str(d.label) ?? "—" },
          { label: "Category", value: str(d.category) ?? "—" },
          { label: "Type", value: str(d.content_type) ?? "—" },
        ],
      };
    case "funding.report_ready":
      return {
        ...base,
        title: "Money Finder report ready",
        startup: projectId ? `Project ${short(projectId)}` : null,
        link: str(d.url),
        fields: [
          { label: "Grants", value: String(num(d.grant_count) ?? 0) },
          { label: "Programs", value: String(num(d.program_count) ?? 0) },
        ],
      };
    case "evaluation.report_ready": {
      const svi = num(d.svi_total);
      const evaluationId = str(d.evaluation_id);
      return {
        ...base,
        title: "Evaluation report ready",
        startup: projectId ? `Project ${short(projectId)}` : null,
        svi,
        link: evaluationId ? `${SITE}/workspace/evaluations/${encodeURIComponent(evaluationId)}` : null,
        fields: [
          { label: "SVI", value: svi === null ? "—" : String(Math.round(svi)) },
          { label: "Kind", value: str(d.kind) ?? "—" },
        ],
      };
    }
    case "intake.submission_received": {
      const svi = num(d.svi_total);
      const evaluationId = str(d.evaluation_id);
      const cov = d.coverage_summary && typeof d.coverage_summary === "object" ? (d.coverage_summary as Record<string, unknown>) : null;
      return {
        ...base,
        title: "New intake submission",
        startup: str(d.startup_name),
        svi,
        link: evaluationId ? `${SITE}/workspace/evaluations/${encodeURIComponent(evaluationId)}` : `${SITE}/workspace/investor/dealflow?tab=intake`,
        fields: [
          { label: "Startup", value: str(d.startup_name) ?? "—" },
          { label: "SVI", value: svi === null ? "not scored yet" : String(Math.round(svi)) },
          { label: "Status", value: str(d.status) ?? "—" },
          { label: "Coverage", value: cov ? `${num(cov.strong) ?? 0} strong · ${num(cov.partial) ?? 0} partial · ${num(cov.missing) ?? 0} missing` : "—" },
        ],
      };
    }
    case "feedback_letter.sent":
      return {
        ...base,
        title: "What investors said — letter ready",
        startup: projectId ? `Project ${short(projectId)}` : null,
        link: str(d.dashboard_url),
        fields: [
          { label: "Evaluators", value: String(num(d.k) ?? 0) },
          { label: "Organisations", value: String(num(d.org_count) ?? 0) },
          { label: "Weakest dimension", value: str(d.weakest_dim) ?? "—" },
        ],
      };
    case "assessment.submitted": {
      const conviction = num(d.conviction);
      return {
        ...base,
        title: "Assessment submitted",
        startup: str(d.startup_name) ?? (projectId ? `Project ${short(projectId)}` : null),
        link: str(d.dossier_url),
        fields: [
          { label: "Startup", value: str(d.startup_name) ?? "—" },
          { label: "Decision", value: str(d.decision) ?? "—" },
          { label: "Conviction", value: conviction === null ? "—" : `${conviction}/5` },
          { label: "Version", value: d.version == null ? "—" : `v${d.version}` },
        ],
      };
    }
    case "ping":
      return { ...base, title: "BlockID test ping", link: `${SITE}/docs#webhooks`, fields: [{ label: "Endpoint", value: short(d.endpoint_id) }, { label: "Sent", value: str(d.sent_at) ?? "—" }] };
    default:
      return base;
  }
}

/** Flat `label → value` map (Airtable fields, Affinity note lines). */
export function summaryToFields(s: EnvelopeSummary): Record<string, string | number | null> {
  const out: Record<string, string | number | null> = {
    Event: s.event,
    Title: s.title,
    Startup: s.startup,
    SVI: s.svi,
    Delta: s.delta,
    Link: s.link,
  };
  for (const f of s.fields) if (!(f.label in out)) out[f.label] = f.value;
  return out;
}
