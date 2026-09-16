"use client";

// Founder taxonomy confirmation card (G13-W4-D2 E1.4; BA spec §B.6 step 3,
// §B.10 T1, §C.5). "We classified your startup as Fintech · Marketplace ·
// Seed · B2B · NSW. Correct?" → [Confirm] [Edit] [Not sure] per axis.
//
//   * summary mode: the six axes as chips with the pipeline's confidence
//     ("Industry 82 % sure"), Confirm / Edit buttons; an unclassified
//     industry (DQ-1) says "We couldn't classify your industry — pick one".
//   * edit mode: one select per axis with the suggestion pre-selected, a
//     "Not sure" toggle per axis (→ unclassified), tags as checkboxes
//     (protected tags = founder-declared only, explained inline).
//   * confirmed: shows the confirmed date + Edit; a later auto run never
//     overwrites confirmed fields (store DQ-5) — the card only shows the
//     "Suggestion differs" hint when `suggested` disagrees.
//   * PATCH /api/projects/[id]/taxonomy { …axes, not_sure[], confirm }.
//   * GA4: taxonomy_card_viewed (mount, unconfirmed) · taxonomy_edited
//     {field} · taxonomy_confirmed {changed_fields, unclassified_count}.
//
// Pure vocabulary only (lib/taxonomy/startup-taxonomy.ts has no server-only
// import) so this stays a small client component.

import { useEffect, useMemo, useRef, useState } from "react";
import { userErrorMessage } from "@/lib/ui/user-error";
import { trackEvent } from "@/lib/analytics";
import { CANONICAL_STAGES, CANONICAL_STAGE_LABELS, type StageKey } from "@/lib/journey-vocabulary";
import {
  BUSINESS_MODELS,
  BUSINESS_MODEL_LABELS,
  CUSTOMER_TYPES,
  CUSTOMER_TYPE_LABELS,
  GEO_SCOPES,
  GEO_SCOPE_LABELS,
  HQ_STATES,
  INDUSTRIES,
  INDUSTRY_LABELS,
  PROTECTED_TAGS,
  TAGS,
  TAG_LABELS,
  isProtectedTag,
  type BusinessModel,
  type CustomerType,
  type GeoScope,
  type HqState,
  type Industry,
  type StartupTaxonomyRow,
  type Tag,
} from "@/lib/taxonomy/startup-taxonomy";

export type TaxonomyAxis = "industry" | "business_model" | "stage_key" | "customer_types" | "geo_scope" | "hq_state" | "tags";

export interface TaxonomyConfirmCardProps {
  projectId: string;
  projectName: string;
  taxonomy: StartupTaxonomyRow | null;
  /** "founder" hides nothing; "evaluator" explains that protected tags are founder-only. */
  actor?: "founder" | "evaluator";
}

interface Draft {
  industry: Industry;
  business_model: BusinessModel;
  stage_key: StageKey;
  customer_types: CustomerType[];
  geo_scope: GeoScope | null;
  hq_state: HqState | null;
  tags: Tag[];
  not_sure: TaxonomyAxis[];
}

const AXIS_LABEL: Record<Exclude<TaxonomyAxis, "tags">, string> = {
  industry: "Industry",
  business_model: "Business model",
  stage_key: "Stage",
  customer_types: "Customer type",
  geo_scope: "Geography",
  hq_state: "HQ state",
};

function draftFrom(t: StartupTaxonomyRow | null): Draft {
  return {
    industry: t?.industry ?? "unclassified",
    business_model: t?.business_model ?? "unclassified",
    stage_key: t?.stage_key ?? "idea",
    customer_types: t?.customer_types?.length ? [...t.customer_types] : [],
    geo_scope: t?.geo_scope ?? null,
    hq_state: t?.hq_state ?? null,
    tags: t?.tags ? [...t.tags] : [],
    not_sure: [],
  };
}

function pct(v: number | undefined): string | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? `${Math.round(v * 100)} % sure` : null;
}

/** Human summary "Fintech · Marketplace · Seed · B2B · NSW" (exported for tests). */
export function taxonomySummary(t: Pick<StartupTaxonomyRow, "industry" | "business_model" | "stage_key" | "customer_types" | "hq_state"> | null): string {
  if (!t) return "not classified yet";
  const parts = [
    INDUSTRY_LABELS[t.industry]?.en ?? "Unclassified",
    BUSINESS_MODEL_LABELS[t.business_model]?.en ?? "Unclassified",
    CANONICAL_STAGE_LABELS[t.stage_key]?.label_en ?? t.stage_key,
    t.customer_types.length ? t.customer_types.map((c) => CUSTOMER_TYPE_LABELS[c]?.en ?? c).join(" / ") : "Unclassified",
  ];
  if (t.hq_state) parts.push(t.hq_state);
  return parts.join(" · ");
}

const selectCls = "mt-1 w-full rounded-lg border border-surface-300 bg-white px-2 py-1.5 text-sm text-ink-800 focus:border-brand-500 focus:outline-none disabled:bg-surface-50";
const btnCls = "rounded-lg border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50";

export function TaxonomyConfirmCard({ projectId, projectName, taxonomy, actor = "founder" }: TaxonomyConfirmCardProps) {
  const [row, setRow] = useState<StartupTaxonomyRow | null>(taxonomy);
  const [mode, setMode] = useState<"summary" | "edit">(taxonomy && taxonomy.industry !== "unclassified" ? "summary" : "edit");
  const [draft, setDraft] = useState<Draft>(() => draftFrom(taxonomy));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [touched, setTouched] = useState<Set<TaxonomyAxis>>(new Set());
  const viewed = useRef(false);

  const confirmed = Boolean(row?.confirmed_at);
  const confidence = row?.confidence ?? {};
  const unclassifiedIndustry = !row || row.industry === "unclassified";

  useEffect(() => {
    if (viewed.current || confirmed) return;
    viewed.current = true;
    const n = (row ? [row.industry === "unclassified", row.business_model === "unclassified", !row.customer_types.length] : [true, true, true]).filter(Boolean).length;
    trackEvent("taxonomy_card_viewed", { project_id: projectId, unclassified_count: n });
  }, [confirmed, projectId, row]);

  const differs = useMemo(() => {
    if (!row?.confirmed_at || !row.suggested) return [] as string[];
    const s = row.suggested as Record<string, unknown>;
    const out: string[] = [];
    if (typeof s.industry === "string" && s.industry !== "unclassified" && s.industry !== row.industry) out.push("industry");
    if (typeof s.business_model === "string" && s.business_model !== "unclassified" && s.business_model !== row.business_model) out.push("business model");
    if (typeof s.stage_key === "string" && s.stage_key !== row.stage_key) out.push("stage");
    return out;
  }, [row]);

  const edit = <K extends keyof Draft>(field: K, value: Draft[K], axis: TaxonomyAxis) => {
    setDraft((d) => ({ ...d, [field]: value, not_sure: d.not_sure.filter((a) => a !== axis) }));
    setTouched((t) => new Set(t).add(axis));
    trackEvent("taxonomy_edited", { project_id: projectId, field: axis });
  };
  const toggleNotSure = (axis: TaxonomyAxis) => {
    setDraft((d) => ({ ...d, not_sure: d.not_sure.includes(axis) ? d.not_sure.filter((a) => a !== axis) : [...d.not_sure, axis] }));
    setTouched((t) => new Set(t).add(axis));
    trackEvent("taxonomy_edited", { project_id: projectId, field: axis });
  };

  const save = async (confirm: boolean) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const body: Record<string, unknown> = { confirm, not_sure: draft.not_sure };
      if (mode === "edit" || confirm) {
        body.industry = draft.industry;
        body.business_model = draft.business_model;
        body.stage_key = draft.stage_key;
        body.customer_types = draft.customer_types;
        body.geo_scope = draft.geo_scope;
        body.hq_state = draft.hq_state;
        body.tags = draft.tags;
      }
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/taxonomy`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; taxonomy?: StartupTaxonomyRow; changed?: string[]; dropped_protected_tags?: string[]; unclassified_count?: number; message?: string; error?: string };
      if (!res.ok || !json.ok || !json.taxonomy) {
        setError(json.message ?? json.error ?? `Save failed (${res.status})`);
        return;
      }
      setRow(json.taxonomy);
      setDraft(draftFrom(json.taxonomy));
      setMode("summary");
      if (confirm) trackEvent("taxonomy_confirmed", { project_id: projectId, changed_fields: touched.size, unclassified_count: json.unclassified_count ?? 0 });
      setTouched(new Set());
      if (json.dropped_protected_tags?.length) setNotice(`Protected tags can only be declared by the founder: ${json.dropped_protected_tags.join(", ")} were not saved.`);
      else setNotice(confirm ? "Classification confirmed. Automatic re-analysis will never overwrite it." : "Saved.");
    } catch (err) {
      setError(userErrorMessage(err, "Could not save your classification. Please try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="taxonomy-card-heading" className="rounded-2xl border border-surface-200 bg-white p-5 sm:p-6" data-testid="taxonomy-confirm-card" data-confirmed={confirmed ? "true" : "false"} data-mode={mode}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="taxonomy-card-heading" className="text-base font-semibold text-ink-900">How we classify {projectName}</h2>
          <p className="mt-1 text-sm text-ink-600" data-testid="taxonomy-summary">
            {unclassifiedIndustry && !confirmed ? (
              <>We couldn&apos;t classify your industry — pick one below.</>
            ) : (
              <>
                We classified your startup as <strong>{taxonomySummary(row)}</strong>.{confirmed ? "" : " Correct?"}
              </>
            )}
          </p>
          {confirmed ? (
            <p className="mt-1 text-xs text-emerald-800" data-testid="taxonomy-confirmed">
              Confirmed {fmt(row!.confirmed_at)} — automatic re-analysis never overwrites it.
              {differs.length ? ` Our latest analysis suggests a different ${differs.join(" / ")}; edit if that is right.` : ""}
            </p>
          ) : null}
        </div>
        {mode === "summary" ? (
          <div className="flex gap-2">
            {!confirmed ? (
              <button type="button" className={`${btnCls} border-brand-600 bg-brand-600 text-white`} onClick={() => void save(true)} disabled={busy} data-testid="taxonomy-confirm">
                Confirm
              </button>
            ) : null}
            <button type="button" className={`${btnCls} border-surface-300 text-ink-700`} onClick={() => setMode("edit")} disabled={busy} data-testid="taxonomy-edit">
              Edit
            </button>
          </div>
        ) : null}
      </div>

      {mode === "summary" ? (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs" data-testid="taxonomy-chips">
          {(["industry", "business_model", "stage_key", "customer_types", "geo_scope", "hq_state"] as const).map((axis) => {
            const value =
              axis === "industry" ? INDUSTRY_LABELS[draft.industry]?.en
              : axis === "business_model" ? BUSINESS_MODEL_LABELS[draft.business_model]?.en
              : axis === "stage_key" ? CANONICAL_STAGE_LABELS[draft.stage_key]?.label_en
              : axis === "customer_types" ? (draft.customer_types.length ? draft.customer_types.map((c) => CUSTOMER_TYPE_LABELS[c]?.en ?? c).join(" / ") : "Unclassified")
              : axis === "geo_scope" ? (draft.geo_scope ? GEO_SCOPE_LABELS[draft.geo_scope]?.en : "—")
              : (draft.hq_state ?? "—");
            const c = pct(confidence[axis]);
            const src = row?.sources?.[axis];
            return (
              <li key={axis} className="rounded-full border border-surface-200 bg-surface-50 px-2.5 py-1 text-ink-700">
                <span className="text-ink-500">{AXIS_LABEL[axis]}:</span> {value}
                {c && src === "auto" ? <span className="ml-1 text-ink-400">({c})</span> : null}
                {src && src !== "auto" ? <span className="ml-1 text-emerald-700">✓</span> : null}
              </li>
            );
          })}
          {draft.tags.map((t) => (
            <li key={t} className="rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-brand-800">
              {TAG_LABELS[t]?.en ?? t}
            </li>
          ))}
        </ul>
      ) : (
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save(true);
          }}
          data-testid="taxonomy-form"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AxisField axis="industry" label={AXIS_LABEL.industry} confidence={pct(confidence.industry)} notSure={draft.not_sure.includes("industry")} onNotSure={() => toggleNotSure("industry")}>
              <select id="tax-industry" className={selectCls} value={draft.industry} disabled={draft.not_sure.includes("industry")} onChange={(e) => edit("industry", e.target.value as Industry, "industry")}>
                {INDUSTRIES.map((i) => (
                  <option key={i} value={i}>{INDUSTRY_LABELS[i].en}</option>
                ))}
              </select>
            </AxisField>
            <AxisField axis="business_model" label={AXIS_LABEL.business_model} confidence={pct(confidence.business_model)} notSure={draft.not_sure.includes("business_model")} onNotSure={() => toggleNotSure("business_model")}>
              <select id="tax-business_model" className={selectCls} value={draft.business_model} disabled={draft.not_sure.includes("business_model")} onChange={(e) => edit("business_model", e.target.value as BusinessModel, "business_model")}>
                {BUSINESS_MODELS.map((m) => (
                  <option key={m} value={m}>{BUSINESS_MODEL_LABELS[m].en}</option>
                ))}
              </select>
            </AxisField>
            <AxisField axis="stage_key" label={AXIS_LABEL.stage_key} confidence={pct(confidence.stage_key)}>
              <select id="tax-stage_key" className={selectCls} value={draft.stage_key} onChange={(e) => edit("stage_key", e.target.value as StageKey, "stage_key")}>
                {CANONICAL_STAGES.map((s) => (
                  <option key={s} value={s}>{CANONICAL_STAGE_LABELS[s].label_en}</option>
                ))}
              </select>
            </AxisField>
            <AxisField axis="customer_types" label={AXIS_LABEL.customer_types} confidence={pct(confidence.customer_types)} notSure={draft.not_sure.includes("customer_types")} onNotSure={() => toggleNotSure("customer_types")}>
              <div className="mt-1 flex flex-wrap gap-2" role="group" aria-labelledby="tax-customer_types-label">
                {CUSTOMER_TYPES.filter((c) => c !== "unclassified").map((c) => {
                  const id = `tax-ct-${c}`;
                  return (
                    <span key={c} className="inline-flex items-center gap-1 text-sm">
                      <input id={id} type="checkbox" checked={draft.customer_types.includes(c)} disabled={draft.not_sure.includes("customer_types")} onChange={(e) => edit("customer_types", e.target.checked ? [...draft.customer_types.filter((x) => x !== "unclassified"), c] : draft.customer_types.filter((x) => x !== c), "customer_types")} />
                      <label htmlFor={id}>{CUSTOMER_TYPE_LABELS[c].en}</label>
                    </span>
                  );
                })}
              </div>
            </AxisField>
            <AxisField axis="geo_scope" label={AXIS_LABEL.geo_scope} confidence={pct(confidence.geo_scope)} notSure={draft.not_sure.includes("geo_scope")} onNotSure={() => toggleNotSure("geo_scope")}>
              <select id="tax-geo_scope" className={selectCls} value={draft.geo_scope ?? ""} disabled={draft.not_sure.includes("geo_scope")} onChange={(e) => edit("geo_scope", (e.target.value || null) as GeoScope | null, "geo_scope")}>
                <option value="">—</option>
                {GEO_SCOPES.map((g) => (
                  <option key={g} value={g}>{GEO_SCOPE_LABELS[g].en}</option>
                ))}
              </select>
            </AxisField>
            <AxisField axis="hq_state" label={AXIS_LABEL.hq_state} confidence={pct(confidence.hq_state)} notSure={draft.not_sure.includes("hq_state")} onNotSure={() => toggleNotSure("hq_state")}>
              <select id="tax-hq_state" className={selectCls} value={draft.hq_state ?? ""} disabled={draft.not_sure.includes("hq_state")} onChange={(e) => edit("hq_state", (e.target.value || null) as HqState | null, "hq_state")}>
                <option value="">—</option>
                {HQ_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </AxisField>
          </div>

          <fieldset>
            <legend className="text-xs font-medium text-ink-700">Tags</legend>
            <p className="text-xs text-ink-500">
              {actor === "founder" ? `${PROTECTED_TAGS.map((t) => TAG_LABELS[t].en).join(" and ")} are founder-declared only — tick them only if true for your startup.` : `${PROTECTED_TAGS.map((t) => TAG_LABELS[t].en).join(" and ")} can only be declared by the founder.`}
            </p>
            <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3" data-testid="taxonomy-tags">
              {TAGS.map((t) => {
                const id = `tax-tag-${t}`;
                const protectedTag = isProtectedTag(t);
                const disabled = protectedTag && actor !== "founder";
                return (
                  <li key={t} className="inline-flex items-center gap-2 text-sm">
                    <input id={id} type="checkbox" checked={draft.tags.includes(t)} disabled={disabled} onChange={(e) => edit("tags", e.target.checked ? [...draft.tags, t] : draft.tags.filter((x) => x !== t), "tags")} />
                    <label htmlFor={id} className={disabled ? "text-ink-400" : "text-ink-800"}>
                      {TAG_LABELS[t].en}
                      {protectedTag ? <span className="ml-1 text-[10px] uppercase tracking-wide text-ink-400">founder-declared</span> : null}
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>

          {error ? <p className="text-sm text-red-700" role="alert">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={`${btnCls} border-brand-600 bg-brand-600 text-white`} disabled={busy} data-testid="taxonomy-confirm">
              {busy ? "Saving…" : "Confirm classification"}
            </button>
            <button type="button" className={`${btnCls} border-surface-300 text-ink-700`} onClick={() => void save(false)} disabled={busy} data-testid="taxonomy-save">
              Save without confirming
            </button>
            {row ? (
              <button type="button" className={`${btnCls} border-transparent text-ink-600`} onClick={() => { setDraft(draftFrom(row)); setMode("summary"); }} disabled={busy}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      )}
      {notice ? <p className="mt-3 text-xs text-emerald-800" role="status" data-testid="taxonomy-notice">{notice}</p> : null}
      {error && mode === "summary" ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
    </section>
  );
}

function AxisField({ axis, label, confidence, notSure, onNotSure, children }: { axis: TaxonomyAxis; label: string; confidence: string | null; notSure?: boolean; onNotSure?: () => void; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={`tax-${axis}`} id={`tax-${axis}-label`} className="text-xs font-medium text-ink-700">
          {label}
          {confidence ? <span className="ml-1 font-normal text-ink-400">({confidence})</span> : null}
        </label>
        {onNotSure ? (
          <label className="inline-flex items-center gap-1 text-xs text-ink-600">
            <input type="checkbox" checked={Boolean(notSure)} onChange={onNotSure} data-testid={`taxonomy-notsure-${axis}`} /> Not sure
          </label>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}
