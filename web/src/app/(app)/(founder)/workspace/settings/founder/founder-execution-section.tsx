"use client";

// Founder profile → "Execution" section (G14-S37).
//
// Structured rows the execution rubric (lib/founder/execution.ts) scores:
// prior exits, prior raises, the four leadership seats, full-time %, worked
// together before, GitHub URL — plus "Import from LinkedIn PDF", which
// posts the export to /api/founder-profile/import-linkedin (the S-R5 parser
// behind a feature-detected dynamic import) and prefills years / employers
// with execution_source[field] = "linkedin_parser". Every hand edit stamps
// the field "founder" again. The live score preview runs the same pure
// rubric the report uses, so the founder sees the 70 cap before saving.
//
// Saved through the existing POST /api/founder-profile (Zod in
// lib/founder/execution-input.ts) by the parent form. Strings come from the
// execution.* catalogue (EN + VI) via the `labels` prop; the key is the
// last-resort fallback so a missing string is visible, never a crash.

import * as React from "react";
import { userErrorMessage } from "@/lib/ui/user-error";
import { Download, Loader2, Plus, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  AMOUNT_BANDS,
  EMPTY_ROLES,
  EXIT_TYPES,
  RAISE_ROUNDS,
  ROLE_KEYS,
  VALUE_BANDS,
  type ExecutionSource,
  type FounderProfile,
  type PriorExit,
  type PriorRaise,
  type RoleKey,
} from "@/lib/founder-profile-types";
import { founderExecutionSignals, EXECUTION_CAP_SELF_REPORTED } from "@/lib/founder/execution";

export interface FounderExecutionSectionProps {
  p: FounderProfile;
  setP: (next: FounderProfile) => void;
  /** execution.* strings for the active locale (the page merges EN under the locale). */
  labels: Record<string, string>;
}

const inputCls = "text-xs border border-border rounded px-2 py-1 bg-background";

interface ImportPrefill {
  years_in_domain: number | null;
  prev_employers: string[];
  exits: number;
  full_name: string | null;
  linkedin_url: string | null;
  filled: string[];
}

interface ImportResponse {
  ok: boolean;
  error?: string;
  detail?: string;
  prefill?: ImportPrefill;
}

interface ImportMessage {
  tone: "ok" | "warn" | "err";
  text: string;
}

export function fillTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z]+)\}/g, (_m, k: string) => String(vars[k] ?? ""));
}

function yearOrNull(raw: string): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function pctOrNull(raw: string): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, n));
}

function workedTogetherValue(v: boolean | null | undefined): "yes" | "no" | "unknown" {
  if (v === true) return "yes";
  if (v === false) return "no";
  return "unknown";
}

function workedTogetherFromValue(v: string): boolean | null {
  if (v === "yes") return true;
  if (v === "no") return false;
  return null;
}

const NEW_EXIT: PriorExit = { company: "", year: null, type: "acquisition", value_band: "undisclosed" };
const NEW_RAISE: PriorRaise = { company: "", round: "seed", amount_aud_band: "250k-1m", year: null };

export function FounderExecutionSection({ p, setP, labels }: FounderExecutionSectionProps) {
  const L = React.useCallback((key: string, fallback?: string) => labels[key] || fallback || key, [labels]);
  const [importing, setImporting] = React.useState(false);
  const [importMsg, setImportMsg] = React.useState<ImportMessage | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const exits = Array.isArray(p.prior_exits) ? p.prior_exits : [];
  const raises = Array.isArray(p.prior_raises) ? p.prior_raises : [];
  const roles = p.roles ?? EMPTY_ROLES();
  const preview = React.useMemo(() => founderExecutionSignals(p), [p]);

  /** Patch execution fields and stamp their provenance. */
  const patch = (fields: Partial<FounderProfile>, source: ExecutionSource = "founder") => {
    const stamped: Partial<Record<string, ExecutionSource>> = { ...(p.execution_source ?? {}) };
    for (const k of Object.keys(fields)) stamped[k] = source;
    setP({ ...p, ...fields, execution_source: stamped });
  };

  const setExit = (i: number, next: Partial<PriorExit>) => {
    patch({ prior_exits: exits.map((e, j) => (j === i ? { ...e, ...next } : e)) });
  };
  const setRaise = (i: number, next: Partial<PriorRaise>) => {
    patch({ prior_raises: raises.map((r, j) => (j === i ? { ...r, ...next } : r)) });
  };

  async function importLinkedIn(file: File) {
    setImporting(true);
    setImportMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      if (p.linkedin_url) fd.set("profileUrl", p.linkedin_url);
      const res = await fetch("/api/founder-profile/import-linkedin", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({ ok: false }))) as ImportResponse;
      if (res.status === 501 || data.error === "parser_unavailable") {
        setImportMsg({ tone: "warn", text: L("execution.import.unavailable") });
        return;
      }
      if (!res.ok || !data.ok || !data.prefill) {
        const reason = data.detail ?? data.error ?? `HTTP ${res.status}`;
        setImportMsg({ tone: "err", text: fillTemplate(L("execution.import.failed"), { reason }) });
        return;
      }
      const pre = data.prefill;
      const fields: Partial<FounderProfile> = {};
      const filled: string[] = [];
      if (pre.years_in_domain != null && pre.filled.includes("years_in_domain")) {
        fields.years_in_domain = pre.years_in_domain;
        filled.push("years_in_domain");
      }
      if (pre.prev_employers.length > 0 && pre.filled.includes("prev_employers")) {
        const merged = [...p.prev_employers];
        for (const c of pre.prev_employers) {
          if (!merged.some((m) => m.toLowerCase() === c.toLowerCase())) merged.push(c);
        }
        fields.prev_employers = merged.slice(0, 20);
        filled.push("prev_employers");
      }
      if (pre.full_name && !p.full_name) {
        fields.full_name = pre.full_name;
        filled.push("full_name");
      }
      if (pre.linkedin_url && !p.linkedin_url) {
        fields.linkedin_url = pre.linkedin_url;
        filled.push("linkedin_url");
      }
      if (filled.length > 0) patch(fields, "linkedin_parser");
      const parts = [fillTemplate(L("execution.import.applied"), { fields: filled.join(", ") || "—" })];
      if (pre.exits > 0 && exits.length === 0) parts.push(fillTemplate(L("execution.import.exits"), { n: pre.exits }));
      setImportMsg({ tone: "ok", text: parts.join(" ") });
    } catch (err) {
      const reason = userErrorMessage(err, "network");
      setImportMsg({ tone: "err", text: fillTemplate(L("execution.import.failed"), { reason }) });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const liftedBy = preview.capLiftedBy ? L(`execution.score.by.${preview.capLiftedBy}`) : null;
  const scoreTone = preview.executionScore >= 70 ? "text-emerald-600" : preview.executionScore >= 40 ? "text-blue-600" : "text-amber-600";
  const importIcon = importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />;
  const importTone = importMsg?.tone === "ok" ? "text-emerald-700" : importMsg?.tone === "warn" ? "text-amber-700" : "text-red-600";

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-5" data-testid="founder-execution-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-blue-500" />
            {L("execution.title")}
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-2xl">{L("execution.intro")}</p>
        </div>
        <div className="rounded-lg border border-border px-3 py-2 min-w-[12rem]" data-testid="execution-score-preview" data-execution-score={preview.executionScore}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{L("execution.score.title")}</span>
            <span className={cn("text-lg font-bold tabular-nums", scoreTone)}>
              {preview.executionScore}
              <span className="text-[10px] font-normal text-muted-foreground">/100</span>
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{L("execution.score.rubric")}</p>
          {preview.capped && <p className="text-[10px] text-amber-700 mt-1" data-testid="execution-cap-notice">{L("execution.score.capped")}</p>}
          {liftedBy && <p className="text-[10px] text-emerald-700 mt-1">{fillTemplate(L("execution.score.lifted"), { by: liftedBy })}</p>}
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          data-testid="linkedin-pdf-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importLinkedIn(f);
          }}
        />
        <button
          type="button"
          disabled={importing}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
          data-testid="linkedin-import-button"
        >
          {importIcon}
          {L("execution.import.button")}
        </button>
        <p className="text-[11px] text-muted-foreground flex-1 min-w-[12rem]">{L("execution.import.hint")}</p>
        {importMsg && (
          <p className={cn("w-full text-[11px]", importTone)} data-testid="linkedin-import-message">
            {importMsg.text}
          </p>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-foreground block mb-1">{L("execution.exits.title")}</label>
        <p className="text-[11px] text-muted-foreground mb-2">{L("execution.exits.hint")}</p>
        <div className="space-y-2">
          {exits.map((e, i) => (
            <div key={i} className="rounded-lg border border-border p-2 grid grid-cols-12 gap-2" data-testid="exit-row">
              <input className={cn(inputCls, "col-span-4")} placeholder={L("execution.exits.company")} value={e.company} onChange={(ev) => setExit(i, { company: ev.target.value })} />
              <input className={cn(inputCls, "col-span-2")} type="number" min={1970} max={2100} placeholder={L("execution.exits.year")} value={e.year ?? ""} onChange={(ev) => setExit(i, { year: yearOrNull(ev.target.value) })} />
              <select className={cn(inputCls, "col-span-3")} value={e.type} aria-label={L("execution.exits.type")} onChange={(ev) => setExit(i, { type: ev.target.value as PriorExit["type"] })}>
                {EXIT_TYPES.map((t) => (
                  <option key={t} value={t}>{L(`execution.exits.type.${t}`, t)}</option>
                ))}
              </select>
              <select className={cn(inputCls, "col-span-2")} value={e.value_band} aria-label={L("execution.exits.value_band")} onChange={(ev) => setExit(i, { value_band: ev.target.value as PriorExit["value_band"] })}>
                {VALUE_BANDS.map((b) => (
                  <option key={b} value={b}>{L(`execution.value_band.${b}`, b)}</option>
                ))}
              </select>
              <button type="button" onClick={() => patch({ prior_exits: exits.filter((_, j) => j !== i) })} className="col-span-1 text-red-500 hover:text-red-700 flex items-center justify-center" aria-label={L("execution.remove")}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        {exits.length < 10 && (
          <button type="button" onClick={() => patch({ prior_exits: [...exits, { ...NEW_EXIT }] })} className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium" data-testid="add-exit">
            <Plus className="h-3 w-3" /> {L("execution.exits.add")}
          </button>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-foreground block mb-1">{L("execution.raises.title")}</label>
        <p className="text-[11px] text-muted-foreground mb-2">{L("execution.raises.hint")}</p>
        <div className="space-y-2">
          {raises.map((r, i) => (
            <div key={i} className="rounded-lg border border-border p-2 grid grid-cols-12 gap-2" data-testid="raise-row">
              <input className={cn(inputCls, "col-span-4")} placeholder={L("execution.raises.company")} value={r.company} onChange={(ev) => setRaise(i, { company: ev.target.value })} />
              <select className={cn(inputCls, "col-span-3")} value={r.round} aria-label={L("execution.raises.round")} onChange={(ev) => setRaise(i, { round: ev.target.value as PriorRaise["round"] })}>
                {RAISE_ROUNDS.map((rd) => (
                  <option key={rd} value={rd}>{L(`execution.raises.round.${rd}`, rd)}</option>
                ))}
              </select>
              <select className={cn(inputCls, "col-span-2")} value={r.amount_aud_band} aria-label={L("execution.raises.amount")} onChange={(ev) => setRaise(i, { amount_aud_band: ev.target.value as PriorRaise["amount_aud_band"] })}>
                {AMOUNT_BANDS.map((b) => (
                  <option key={b} value={b}>{L(`execution.amount_band.${b}`, b)}</option>
                ))}
              </select>
              <input className={cn(inputCls, "col-span-2")} type="number" min={1970} max={2100} placeholder={L("execution.raises.year")} value={r.year ?? ""} onChange={(ev) => setRaise(i, { year: yearOrNull(ev.target.value) })} />
              <button type="button" onClick={() => patch({ prior_raises: raises.filter((_, j) => j !== i) })} className="col-span-1 text-red-500 hover:text-red-700 flex items-center justify-center" aria-label={L("execution.remove")}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        {raises.length < 10 && (
          <button type="button" onClick={() => patch({ prior_raises: [...raises, { ...NEW_RAISE }] })} className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium" data-testid="add-raise">
            <Plus className="h-3 w-3" /> {L("execution.raises.add")}
          </button>
        )}
      </div>

      <div>
        <label className="text-xs font-semibold text-foreground block mb-1">{L("execution.roles.title")}</label>
        <p className="text-[11px] text-muted-foreground mb-2">{L("execution.roles.hint")}</p>
        <div className="grid sm:grid-cols-4 gap-2">
          {ROLE_KEYS.map((k: RoleKey) => (
            <div key={k}>
              <label htmlFor={`exec-role-${k}`} className="text-[11px] font-medium block mb-0.5">{L(`execution.roles.${k}`, k.toUpperCase())}</label>
              <input id={`exec-role-${k}`} className={cn(inputCls, "w-full")} value={roles[k] ?? ""} onChange={(ev) => patch({ roles: { ...roles, [k]: ev.target.value || null } })} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <div>
          <label htmlFor="exec-full-time" className="text-xs font-semibold block mb-1">{L("execution.full_time.label")}</label>
          <input
            id="exec-full-time"
            type="number"
            min={0}
            max={100}
            className={cn(inputCls, "w-full")}
            value={p.full_time_pct ?? ""}
            onChange={(ev) => patch({ full_time_pct: pctOrNull(ev.target.value) })}
          />
          <p className="text-[11px] text-muted-foreground mt-1">{L("execution.full_time.hint")}</p>
        </div>
        <div>
          <label htmlFor="exec-worked-together" className="text-xs font-semibold block mb-1">{L("execution.worked_together.label")}</label>
          <select
            id="exec-worked-together"
            className={cn(inputCls, "w-full")}
            value={workedTogetherValue(p.worked_together_before)}
            onChange={(ev) => patch({ worked_together_before: workedTogetherFromValue(ev.target.value) })}
          >
            <option value="unknown">{L("execution.worked_together.unknown")}</option>
            <option value="yes">{L("execution.worked_together.yes")}</option>
            <option value="no">{L("execution.worked_together.no")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="exec-github" className="text-xs font-semibold block mb-1">{L("execution.github.label")}</label>
          <input id="exec-github" className={cn(inputCls, "w-full")} placeholder="https://github.com/…" value={p.github_url ?? ""} onChange={(ev) => patch({ github_url: ev.target.value || null })} />
          <p className="text-[11px] text-muted-foreground mt-1">{L("execution.github.hint")}</p>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">cap {EXECUTION_CAP_SELF_REPORTED} · rubric v{preview.rubricVersion}</p>
    </section>
  );
}
