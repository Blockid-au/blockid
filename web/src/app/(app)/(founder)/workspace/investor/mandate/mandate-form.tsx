"use client";

/**
 * MandateForm — the 7-section investor mandate editor (G13-W3-T2, BA spec
 * §B.7). Replaces the "full preferences form ships in a follow-up release"
 * stub. Server page decides persona + plan; this component never checks
 * them itself. Saves through PUT /api/investor/mandates (create) or with
 * `id` (update); the route writes the one-release `investor_prefs` mirror
 * and the 0323 master `investor_discoverable` flag (section 1 toggle).
 *
 * Sections: 1 identity · 2 appetite · 3 stage & cheque · 4 geography ·
 * 5 traction floors · 6 tags & ESG · 7 weights (Program only, sum 100).
 * Chips = real checkboxes (id + htmlFor), sliders = range inputs with a
 * live <output>, money = numeric inputs — everything labelled (a11y).
 * EN / VI via useLocale(); vocabulary labels come from the taxonomy module
 * so the mandate speaks the same language as the startup's classification.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { useLocale, type Locale } from "@/lib/use-locale";
import { trackEvent } from "@/lib/analytics";
import { CANONICAL_STAGE_LABELS } from "@/lib/journey-vocabulary";
import {
  BUSINESS_MODEL_LABELS,
  CUSTOMER_TYPE_LABELS,
  INDUSTRY_LABELS,
  TAG_LABELS,
  type BusinessModel,
  type CustomerType,
  type Industry,
  type Tag,
} from "@/lib/taxonomy/startup-taxonomy";
import { FIT_AXES_V2, FIT_WEIGHTS_V2, type FitAxisV2 } from "@/lib/investors/fit-v2";
import {
  ESG_CONSTRAINTS,
  LEAD_OR_FOLLOW,
  MANDATE_BUSINESS_MODELS,
  MANDATE_CUSTOMER_TYPES,
  MANDATE_GEOGRAPHIES,
  MANDATE_INDUSTRIES,
  MANDATE_KINDS,
  MANDATE_LABEL_MAX_LEN,
  MANDATE_SECTIONS,
  MANDATE_THESIS_MAX_LEN,
  RISK_TOLERANCES,
  type MandateInputRaw,
  type MandateSection,
} from "@/lib/investors/mandates-shared";
import { CANONICAL_STAGES, TAGS } from "@/lib/taxonomy/startup-taxonomy";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";

// ─── Copy (EN / VI) ──────────────────────────────────────────────────────────

type L = Record<Locale, string>;
const T = (en: string, vi: string): L => ({ en, vi });

export const MANDATE_COPY = {
  sections: {
    identity: T("1 · Identity", "1 · Danh tính"),
    appetite: T("2 · Appetite", "2 · Khẩu vị đầu tư"),
    stage_cheque: T("3 · Stage & cheque", "3 · Giai đoạn & quy mô vốn"),
    geography: T("4 · Geography", "4 · Địa lý"),
    floors: T("5 · Traction floors", "5 · Ngưỡng tối thiểu"),
    tags_esg: T("6 · Tags & ESG", "6 · Nhãn & ESG"),
    weights: T("7 · Weights (advanced)", "7 · Trọng số (nâng cao)"),
  } satisfies Record<MandateSection, L>,
  hints: {
    identity: T("Who you are to founders. Only the firm name and thesis are ever shown — never your email.", "Bạn là ai với founder. Chỉ tên quỹ và luận điểm được hiển thị — không bao giờ lộ email."),
    appetite: T("Leave a list empty to mean “any”. Exclusions are hard gates.", "Để trống nghĩa là “bất kỳ”. Loại trừ là chặn cứng."),
    stage_cheque: T("Adjacent stages still score half credit.", "Giai đoạn liền kề vẫn được nửa điểm."),
    geography: T("Pick states, or a wide scope. National / ANZ / APAC / Global covers every Australian state.", "Chọn bang hoặc phạm vi rộng. Toàn quốc / ANZ / APAC / Toàn cầu bao gồm mọi bang."),
    floors: T("Floors are hard gates when the data is verified; unverified data scores half with a “not verified” note.", "Ngưỡng là chặn cứng khi dữ liệu đã xác minh; chưa xác minh được nửa điểm kèm ghi chú."),
    tags_esg: T("Include tags score pro-rata; an excluded tag is a hard gate.", "Nhãn bao gồm tính theo tỷ lệ; nhãn loại trừ là chặn cứng."),
    weights: T("Override the default fit weights for this mandate. The seven must sum to 100.", "Ghi đè trọng số mặc định cho mandate này. Bảy trọng số phải cộng bằng 100."),
  } satisfies Record<MandateSection, L>,
  label: T("Firm / organisation", "Quỹ / tổ chức"),
  labelPh: T("e.g. Sydney Angels", "vd. Sydney Angels"),
  kind: T("Investor type", "Loại nhà đầu tư"),
  thesis: T("Thesis (280 chars)", "Luận điểm đầu tư (280 ký tự)"),
  thesisPh: T("e.g. Pre-seed B2B SaaS in ANZ, A$50k–250k first cheques", "vd. Pre-seed B2B SaaS tại ANZ, séc đầu A$50k–250k"),
  discoverable: T("Let matching founders see me", "Cho founder phù hợp thấy tôi"),
  discoverableSub: T("Growth founders whose sector, stage and location fit your mandate can see your name, firm and thesis and ask us for an intro. We never share your email.", "Founder có ngành, giai đoạn và địa điểm phù hợp có thể thấy tên, quỹ và luận điểm của bạn và nhờ chúng tôi giới thiệu. Chúng tôi không bao giờ chia sẻ email của bạn."),
  sectorsInclude: T("Sectors — include", "Ngành — bao gồm"),
  sectorsExclude: T("Sectors — exclude", "Ngành — loại trừ"),
  businessModels: T("Business models", "Mô hình kinh doanh"),
  customerTypes: T("Customer types", "Loại khách hàng"),
  stages: T("Stages", "Giai đoạn"),
  chequeMin: T("Cheque min (A$)", "Séc tối thiểu (A$)"),
  chequeMax: T("Cheque max (A$)", "Séc tối đa (A$)"),
  leadOrFollow: T("Lead or follow", "Dẫn dắt hay theo sau"),
  ownership: T("Ownership target (%)", "Tỷ lệ sở hữu mục tiêu (%)"),
  followon: T("Follow-on reserve (%)", "Dự trữ vòng sau (%)"),
  geographies: T("Geographies", "Địa lý"),
  revenueMin: T("Minimum annual revenue (A$)", "Doanh thu năm tối thiểu (A$)"),
  growthMin: T("Minimum growth (% YoY)", "Tăng trưởng tối thiểu (%/năm)"),
  minSvi: T("Minimum SVI", "SVI tối thiểu"),
  minSviHint: T("cohort hint: p50 seed = 54", "gợi ý: trung vị seed = 54"),
  tagsInclude: T("Tags — include", "Nhãn — bao gồm"),
  tagsExclude: T("Tags — exclude", "Nhãn — loại trừ"),
  esg: T("ESG constraints", "Ràng buộc ESG"),
  risk: T("Risk tolerance", "Khẩu vị rủi ro"),
  weightsSum: T("Sum", "Tổng"),
  weightsLocked: T("Weights are a Program feature. Scout and Firm mandates use the default 25 / 15 / 20 / 10 / 10 / 10 / 10.", "Trọng số là tính năng gói Program. Scout và Firm dùng mặc định 25 / 15 / 20 / 10 / 10 / 10 / 10."),
  save: T("Save mandate", "Lưu mandate"),
  saving: T("Saving…", "Đang lưu…"),
  saved: T("Mandate saved — deal-flow re-ranks tonight; “Investors who match” updates now.", "Đã lưu mandate — deal-flow xếp hạng lại tối nay; “Nhà đầu tư phù hợp” cập nhật ngay."),
  savedCreated: T("Mandate created.", "Đã tạo mandate."),
  failed: T("Could not save. Try again in a minute.", "Không lưu được. Thử lại sau một phút."),
  invalid: T("Please fix the highlighted fields.", "Vui lòng sửa các trường được đánh dấu."),
  locked: T("Mandates are part of the investor plans.", "Mandate thuộc các gói nhà đầu tư."),
  limit: T("Your plan allows one mandate — edit it instead.", "Gói của bạn cho phép một mandate — hãy chỉnh sửa nó."),
  notMigrated: T("Mandates are not live on this install yet (migration 0393 pending).", "Mandate chưa hoạt động trên bản cài này (đang chờ migration 0393)."),
  none: T("None", "Không"),
  any: T("Any", "Bất kỳ"),
  lead: T("Lead", "Dẫn dắt"),
  follow: T("Follow", "Theo sau"),
  both: T("Lead or follow", "Dẫn dắt hoặc theo sau"),
  low: T("Low", "Thấp"),
  medium: T("Medium", "Trung bình"),
  high: T("High", "Cao"),
  prefsPrefill: T("Prefilled from your previous preferences — review and save to create your mandate.", "Điền sẵn từ tuỳ chọn cũ — kiểm tra và lưu để tạo mandate."),
  seePlans: T("See plans", "Xem các gói"),
} as const;

const KIND_LABEL: Record<(typeof MANDATE_KINDS)[number], L> = {
  vc: T("VC fund", "Quỹ VC"),
  angel: T("Angel / syndicate", "Angel / syndicate"),
  family_office: T("Family office", "Văn phòng gia đình"),
  cvc: T("Corporate VC", "VC doanh nghiệp"),
  accelerator: T("Accelerator", "Vườn ươm / accelerator"),
  government: T("Government", "Chính phủ"),
  institutional: T("Institutional", "Tổ chức"),
};
const GEO_LABEL: Record<string, L> = {
  NSW: T("NSW", "NSW"), VIC: T("VIC", "VIC"), QLD: T("QLD", "QLD"), WA: T("WA", "WA"), SA: T("SA", "SA"), TAS: T("TAS", "TAS"), ACT: T("ACT", "ACT"), NT: T("NT", "NT"),
  national: T("National (all AU)", "Toàn quốc (toàn Úc)"), anz: T("ANZ", "ANZ"), apac: T("APAC", "APAC"), global: T("Global", "Toàn cầu"),
};
const ESG_LABEL: Record<(typeof ESG_CONSTRAINTS)[number], L> = {
  no_gambling: T("No gambling", "Không cờ bạc"),
  no_fossil: T("No fossil fuels", "Không nhiên liệu hoá thạch"),
  no_weapons: T("No weapons", "Không vũ khí"),
  no_tobacco: T("No tobacco", "Không thuốc lá"),
  impact_only: T("Impact only", "Chỉ đầu tư tác động"),
};
const AXIS_LABEL: Record<FitAxisV2, L> = {
  industry: T("Industry", "Ngành"),
  business_model: T("Business model", "Mô hình"),
  stage: T("Stage", "Giai đoạn"),
  geo: T("Geography", "Địa lý"),
  cheque: T("Cheque", "Quy mô séc"),
  tags: T("Tags", "Nhãn"),
  floors: T("Floors", "Ngưỡng"),
};

// ─── State ───────────────────────────────────────────────────────────────────

type Lists = "sectors_include" | "sectors_exclude" | "business_models" | "customer_types" | "stages" | "geographies" | "tags_include" | "tags_exclude" | "esg_constraints";

interface FormState {
  id: string | null;
  label: string;
  kind: (typeof MANDATE_KINDS)[number];
  thesis: string;
  discoverable: boolean;
  sectors_include: string[];
  sectors_exclude: string[];
  business_models: string[];
  customer_types: string[];
  stages: string[];
  cheque_min_aud: string;
  cheque_max_aud: string;
  lead_or_follow: "" | (typeof LEAD_OR_FOLLOW)[number];
  ownership_target_pct: string;
  followon_reserve_pct: string;
  geographies: string[];
  revenue_min_aud: string;
  growth_min_pct: string;
  min_svi: number | null;
  tags_include: string[];
  tags_exclude: string[];
  esg_constraints: string[];
  risk_tolerance: "" | (typeof RISK_TOLERANCES)[number];
  weights: Record<FitAxisV2, number>;
  weightsOn: boolean;
}

const s = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function stateFromDraft(d: MandateInputRaw): FormState {
  const w = d.weights && typeof d.weights === "object" ? d.weights : null;
  return {
    id: d.id ?? null,
    label: d.label ?? "",
    kind: d.kind ?? "angel",
    thesis: d.thesis ?? "",
    discoverable: d.discoverable === true,
    sectors_include: arr(d.sectors_include),
    sectors_exclude: arr(d.sectors_exclude),
    business_models: arr(d.business_models),
    customer_types: arr(d.customer_types),
    stages: arr(d.stages),
    cheque_min_aud: s(d.cheque_min_aud),
    cheque_max_aud: s(d.cheque_max_aud),
    lead_or_follow: d.lead_or_follow ?? "",
    ownership_target_pct: s(d.ownership_target_pct),
    followon_reserve_pct: s(d.followon_reserve_pct),
    geographies: arr(d.geographies),
    revenue_min_aud: s(d.revenue_min_aud),
    growth_min_pct: s(d.growth_min_pct),
    min_svi: typeof d.min_svi === "number" ? d.min_svi : null,
    tags_include: arr(d.tags_include),
    tags_exclude: arr(d.tags_exclude),
    esg_constraints: arr(d.esg_constraints),
    risk_tolerance: d.risk_tolerance ?? "",
    weights: { ...FIT_WEIGHTS_V2, ...(w ?? {}) } as Record<FitAxisV2, number>,
    weightsOn: !!w && Object.keys(w).length > 0,
  };
}

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Form state → the PUT body (pure; exported for the test). */
export function bodyFromState(f: FormState, canEditWeights: boolean): MandateInputRaw {
  return {
    ...(f.id ? { id: f.id } : {}),
    label: f.label.trim(),
    kind: f.kind,
    thesis: f.thesis.trim() || null,
    discoverable: f.discoverable,
    sectors_include: f.sectors_include as MandateInputRaw["sectors_include"],
    sectors_exclude: f.sectors_exclude as MandateInputRaw["sectors_exclude"],
    business_models: f.business_models as MandateInputRaw["business_models"],
    customer_types: f.customer_types as MandateInputRaw["customer_types"],
    stages: f.stages as MandateInputRaw["stages"],
    cheque_min_aud: num(f.cheque_min_aud),
    cheque_max_aud: num(f.cheque_max_aud),
    lead_or_follow: f.lead_or_follow || null,
    ownership_target_pct: num(f.ownership_target_pct),
    followon_reserve_pct: num(f.followon_reserve_pct),
    geographies: f.geographies as MandateInputRaw["geographies"],
    revenue_min_aud: num(f.revenue_min_aud),
    growth_min_pct: num(f.growth_min_pct),
    min_svi: f.min_svi,
    tags_include: f.tags_include as MandateInputRaw["tags_include"],
    tags_exclude: f.tags_exclude as MandateInputRaw["tags_exclude"],
    esg_constraints: f.esg_constraints as MandateInputRaw["esg_constraints"],
    risk_tolerance: f.risk_tolerance || null,
    weights: canEditWeights && f.weightsOn ? f.weights : null,
  };
}

/** Sections carrying a value (mirrors lib sectionsFilled for the GA4 event). */
export function sectionsFilledFromState(f: FormState): number {
  let n = 0;
  if (f.label.trim() || f.thesis.trim()) n += 1;
  if (f.sectors_include.length || f.sectors_exclude.length || f.business_models.length || f.customer_types.length) n += 1;
  if (f.stages.length || f.cheque_min_aud || f.cheque_max_aud || f.lead_or_follow || f.ownership_target_pct || f.followon_reserve_pct) n += 1;
  if (f.geographies.length) n += 1;
  if (f.revenue_min_aud || f.growth_min_pct || f.min_svi !== null) n += 1;
  if (f.tags_include.length || f.tags_exclude.length || f.esg_constraints.length || f.risk_tolerance) n += 1;
  if (f.weightsOn) n += 1;
  return n;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface MandateFormProps {
  draft: MandateInputRaw;
  /** "mandate" = editing an existing row; "prefs" = read-through prefill; "empty" = first time. */
  draftSource: "mandate" | "prefs" | "empty";
  canEditWeights: boolean;
  /** Mandates the user may still create (null = unlimited). */
  limit: number | null;
  mandateCount: number;
  migrated: boolean;
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; created: boolean }
  | { kind: "invalid"; issues: { path: string; message: string }[] }
  | { kind: "locked" }
  | { kind: "limit" }
  | { kind: "not_migrated" }
  | { kind: "failed" };

const input =
  "mt-1 w-full rounded-lg border border-surface-300 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-navy/30";
const chipOn = "inline-flex items-center rounded-full bg-action text-on-action px-3 py-1 text-xs font-semibold cursor-pointer";
const chipOff =
  "inline-flex items-center rounded-full border border-surface-300 bg-white text-ink-700 px-3 py-1 text-xs font-medium hover:bg-surface-100 cursor-pointer";

export function MandateForm({ draft, draftSource, canEditWeights, limit, mandateCount, migrated }: MandateFormProps) {
  const [locale] = useLocale();
  const router = useRouter();
  const t = (l: L) => l[locale];
  const [f, setF] = React.useState<FormState>(() => stateFromDraft(draft));
  const [status, setStatus] = React.useState<Status>({ kind: "idle" });
  const uid = React.useId();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((prev) => ({ ...prev, [k]: v }));
  const toggle = (k: Lists, v: string) =>
    setF((prev) => ({ ...prev, [k]: prev[k].includes(v) ? prev[k].filter((x) => x !== v) : [...prev[k], v] }));

  const weightsSum = FIT_AXES_V2.reduce((a, k) => a + (Number(f.weights[k]) || 0), 0);
  const saving = status.kind === "saving";
  const issueFor = (path: string) => (status.kind === "invalid" ? status.issues.find((i) => i.path === path || i.path.startsWith(`${path}.`))?.message ?? null : null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (canEditWeights && f.weightsOn && weightsSum !== 100) {
      setStatus({ kind: "invalid", issues: [{ path: "weights", message: `sum ${weightsSum} ≠ 100` }] });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      const body = bodyFromState(f, canEditWeights);
      const res = await fetch("/api/investor/mandates", {
        method: f.id ? "PATCH" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; issues?: { path: string; message: string }[]; mandate?: { id: string }; created?: boolean };
      if (res.status === 402 && data.error === "limit_reached") return setStatus({ kind: "limit" });
      if (res.status === 402) return setStatus({ kind: "locked" });
      if (res.status === 503 || data.error === "not_migrated") return setStatus({ kind: "not_migrated" });
      if (res.status === 400) return setStatus({ kind: "invalid", issues: data.issues ?? [] });
      if (!res.ok || !data.ok) return setStatus({ kind: "failed" });
      if (data.mandate?.id) set("id", data.mandate.id);
      setStatus({ kind: "saved", created: data.created === true });
      trackEvent("mandate_saved", { sections_filled: sectionsFilledFromState(f), created: data.created === true });
      router.refresh();
    } catch {
      setStatus({ kind: "failed" });
    }
  }

  const chips = (k: Lists, values: readonly string[], label: (v: string) => string, legend: string) => (
    <fieldset className="mt-4">
      <legend className="text-sm font-medium text-ink-800">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2" data-chips={k}>
        {values.map((v) => {
          const id = `${uid}-${k}-${v}`;
          const on = f[k].includes(v);
          return (
            <span key={v}>
              <input id={id} type="checkbox" className="sr-only" name={k} value={v} checked={on} onChange={() => toggle(k, v)} />
              <label htmlFor={id} className={on ? chipOn : chipOff} data-chip={v} data-on={on ? "1" : "0"}>
                {label(v)}
              </label>
            </span>
          );
        })}
      </div>
      {issueFor(k) ? <p className="mt-1 text-xs text-rose-600">{issueFor(k)}</p> : null}
    </fieldset>
  );

  const field = (id: string, label: string, el: React.ReactNode, hint?: string | null) => (
    <div>
      <label htmlFor={`${uid}-${id}`} className="block text-sm font-medium text-ink-800">
        {label}
      </label>
      {el}
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
      {issueFor(id) ? <p className="mt-1 text-xs text-rose-600">{issueFor(id)}</p> : null}
    </div>
  );

  const section = (key: MandateSection, children: React.ReactNode) => (
    <section
      key={key}
      aria-labelledby={`${uid}-h-${key}`}
      data-mandate-section={key}
      className="rounded-2xl border border-surface-200 bg-white p-6"
    >
      <h2 id={`${uid}-h-${key}`} className="text-lg font-semibold text-ink-900">
        {t(MANDATE_COPY.sections[key])}
      </h2>
      <p className="mt-1 text-sm text-ink-600">{t(MANDATE_COPY.hints[key])}</p>
      {children}
    </section>
  );

  const canCreateMore = f.id !== null || limit === null || mandateCount < limit;

  return (
    <form onSubmit={save} className="space-y-6" data-mandate-form data-mandate-id={f.id ?? ""} data-draft-source={draftSource} noValidate>
      {!migrated ? (
        <p role="status" className="rounded-xl border border-line-subtle border-l-4 border-l-warn bg-surface-sunken px-4 py-3 text-sm text-amber-900" data-not-migrated>
          {t(MANDATE_COPY.notMigrated)}
        </p>
      ) : null}
      {draftSource === "prefs" ? (
        <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900" data-prefs-prefill>
          {t(MANDATE_COPY.prefsPrefill)}
        </p>
      ) : null}

      {section(
        "identity",
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field(
            "label",
            t(MANDATE_COPY.label),
            <input id={`${uid}-label`} name="label" type="text" required maxLength={MANDATE_LABEL_MAX_LEN} value={f.label} placeholder={t(MANDATE_COPY.labelPh)} onChange={(e) => set("label", e.target.value)} className={input} />,
          )}
          {field(
            "kind",
            t(MANDATE_COPY.kind),
            <select id={`${uid}-kind`} name="kind" value={f.kind} onChange={(e) => set("kind", e.target.value as FormState["kind"])} className={input}>
              {MANDATE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(KIND_LABEL[k])}
                </option>
              ))}
            </select>,
          )}
          <div className="sm:col-span-2">
            {field(
              "thesis",
              t(MANDATE_COPY.thesis),
              <textarea id={`${uid}-thesis`} name="thesis" rows={2} maxLength={MANDATE_THESIS_MAX_LEN} value={f.thesis} placeholder={t(MANDATE_COPY.thesisPh)} onChange={(e) => set("thesis", e.target.value)} className={input} />,
              `${f.thesis.length}/${MANDATE_THESIS_MAX_LEN}`,
            )}
          </div>
          <div className="sm:col-span-2 flex items-start justify-between gap-4 rounded-xl border border-surface-200 p-4" data-investor-visibility data-discoverable={f.discoverable ? "1" : "0"}>
            <div>
              <p id={`${uid}-disc-title`} className="text-sm font-semibold text-ink-900">
                {t(MANDATE_COPY.discoverable)}
              </p>
              <p id={`${uid}-disc-sub`} className="mt-1 text-xs text-ink-600 leading-relaxed">
                {t(MANDATE_COPY.discoverableSub)}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={f.discoverable}
              aria-labelledby={`${uid}-disc-title`}
              aria-describedby={`${uid}-disc-sub`}
              onClick={() => set("discoverable", !f.discoverable)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2 ${f.discoverable ? "bg-action" : "bg-surface-400"}`}
              data-visibility-switch
            >
              <span aria-hidden="true" className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${f.discoverable ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>
        </div>,
      )}

      {section(
        "appetite",
        <>
          {chips("sectors_include", MANDATE_INDUSTRIES, (v) => INDUSTRY_LABELS[v as Industry][locale], t(MANDATE_COPY.sectorsInclude))}
          {chips("sectors_exclude", MANDATE_INDUSTRIES, (v) => INDUSTRY_LABELS[v as Industry][locale], t(MANDATE_COPY.sectorsExclude))}
          {chips("business_models", MANDATE_BUSINESS_MODELS, (v) => BUSINESS_MODEL_LABELS[v as BusinessModel][locale], t(MANDATE_COPY.businessModels))}
          {chips("customer_types", MANDATE_CUSTOMER_TYPES, (v) => CUSTOMER_TYPE_LABELS[v as CustomerType][locale], t(MANDATE_COPY.customerTypes))}
        </>,
      )}

      {section(
        "stage_cheque",
        <>
          {chips("stages", CANONICAL_STAGES, (v) => (locale === "vi" ? CANONICAL_STAGE_LABELS[v as keyof typeof CANONICAL_STAGE_LABELS].label_vi : CANONICAL_STAGE_LABELS[v as keyof typeof CANONICAL_STAGE_LABELS].label_en), t(MANDATE_COPY.stages))}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {field("cheque_min_aud", t(MANDATE_COPY.chequeMin), <input id={`${uid}-cheque_min_aud`} name="cheque_min_aud" type="number" inputMode="numeric" min={0} step={1000} value={f.cheque_min_aud} onChange={(e) => set("cheque_min_aud", e.target.value)} className={input} />)}
            {field("cheque_max_aud", t(MANDATE_COPY.chequeMax), <input id={`${uid}-cheque_max_aud`} name="cheque_max_aud" type="number" inputMode="numeric" min={0} step={1000} value={f.cheque_max_aud} onChange={(e) => set("cheque_max_aud", e.target.value)} className={input} />)}
            {field(
              "lead_or_follow",
              t(MANDATE_COPY.leadOrFollow),
              <select id={`${uid}-lead_or_follow`} name="lead_or_follow" value={f.lead_or_follow} onChange={(e) => set("lead_or_follow", e.target.value as FormState["lead_or_follow"])} className={input}>
                <option value="">{t(MANDATE_COPY.any)}</option>
                {LEAD_OR_FOLLOW.map((v) => (
                  <option key={v} value={v}>
                    {t(MANDATE_COPY[v])}
                  </option>
                ))}
              </select>,
            )}
            {field("ownership_target_pct", t(MANDATE_COPY.ownership), <input id={`${uid}-ownership_target_pct`} name="ownership_target_pct" type="number" inputMode="decimal" min={0} max={100} step={0.5} value={f.ownership_target_pct} onChange={(e) => set("ownership_target_pct", e.target.value)} className={input} />)}
            {field("followon_reserve_pct", t(MANDATE_COPY.followon), <input id={`${uid}-followon_reserve_pct`} name="followon_reserve_pct" type="number" inputMode="decimal" min={0} max={100} step={1} value={f.followon_reserve_pct} onChange={(e) => set("followon_reserve_pct", e.target.value)} className={input} />)}
          </div>
        </>,
      )}

      {section("geography", chips("geographies", MANDATE_GEOGRAPHIES, (v) => t(GEO_LABEL[v] ?? T(v, v)), t(MANDATE_COPY.geographies)))}

      {section(
        "floors",
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {field("revenue_min_aud", t(MANDATE_COPY.revenueMin), <input id={`${uid}-revenue_min_aud`} name="revenue_min_aud" type="number" inputMode="numeric" min={0} step={10000} value={f.revenue_min_aud} onChange={(e) => set("revenue_min_aud", e.target.value)} className={input} />)}
          {field("growth_min_pct", t(MANDATE_COPY.growthMin), <input id={`${uid}-growth_min_pct`} name="growth_min_pct" type="number" inputMode="decimal" min={0} step={5} value={f.growth_min_pct} onChange={(e) => set("growth_min_pct", e.target.value)} className={input} />)}
          <div className="sm:col-span-2">
            <label htmlFor={`${uid}-min_svi`} className="block text-sm font-medium text-ink-800">
              {t(MANDATE_COPY.minSvi)}{" "}
              <output htmlFor={`${uid}-min_svi`} className="ml-2 rounded-full bg-surface-200 px-2 py-0.5 text-xs font-semibold text-ink-800" data-min-svi-value>
                {f.min_svi === null ? t(MANDATE_COPY.none) : f.min_svi}
              </output>
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id={`${uid}-min_svi`}
                name="min_svi"
                type="range"
                min={0}
                max={100}
                step={1}
                value={f.min_svi ?? 0}
                aria-valuetext={f.min_svi === null ? t(MANDATE_COPY.none) : String(f.min_svi)}
                onChange={(e) => set("min_svi", Number(e.target.value) === 0 ? null : Number(e.target.value))}
                className="w-full accent-brand-600"
              />
              <button type="button" onClick={() => set("min_svi", null)} className="text-xs text-ink-500 underline">
                {t(MANDATE_COPY.none)}
              </button>
            </div>
            <p className="mt-1 text-xs text-ink-500">{t(MANDATE_COPY.minSviHint)}</p>
          </div>
        </div>,
      )}

      {section(
        "tags_esg",
        <>
          {chips("tags_include", TAGS, (v) => TAG_LABELS[v as Tag][locale], t(MANDATE_COPY.tagsInclude))}
          {chips("tags_exclude", TAGS, (v) => TAG_LABELS[v as Tag][locale], t(MANDATE_COPY.tagsExclude))}
          {chips("esg_constraints", ESG_CONSTRAINTS, (v) => t(ESG_LABEL[v as (typeof ESG_CONSTRAINTS)[number]]), t(MANDATE_COPY.esg))}
          <div className="mt-4 sm:w-1/2">
            {field(
              "risk_tolerance",
              t(MANDATE_COPY.risk),
              <select id={`${uid}-risk_tolerance`} name="risk_tolerance" value={f.risk_tolerance} onChange={(e) => set("risk_tolerance", e.target.value as FormState["risk_tolerance"])} className={input}>
                <option value="">{t(MANDATE_COPY.any)}</option>
                {RISK_TOLERANCES.map((v) => (
                  <option key={v} value={v}>
                    {t(MANDATE_COPY[v])}
                  </option>
                ))}
              </select>,
            )}
          </div>
        </>,
      )}

      {section(
        "weights",
        canEditWeights ? (
          <fieldset className="mt-4" data-weights data-weights-sum={weightsSum}>
            <legend className="sr-only">{t(MANDATE_COPY.sections.weights)}</legend>
            <label className="inline-flex items-center gap-2 text-sm text-ink-800">
              <input type="checkbox" name="weights_on" checked={f.weightsOn} onChange={(e) => set("weightsOn", e.target.checked)} />
              {t(MANDATE_COPY.sections.weights)}
            </label>
            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {FIT_AXES_V2.map((axis) => (
                <div key={axis}>
                  <label htmlFor={`${uid}-w-${axis}`} className="block text-xs font-medium text-ink-700">
                    {t(AXIS_LABEL[axis])}
                  </label>
                  <input
                    id={`${uid}-w-${axis}`}
                    name={`weights.${axis}`}
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    disabled={!f.weightsOn}
                    value={f.weights[axis]}
                    onChange={(e) => set("weights", { ...f.weights, [axis]: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))) })}
                    className={input}
                  />
                </div>
              ))}
            </div>
            <p className={`mt-2 text-xs ${weightsSum === 100 ? "text-ink-500" : "text-rose-600"}`} aria-live="polite">
              {t(MANDATE_COPY.weightsSum)}: {weightsSum} / 100
            </p>
            {issueFor("weights") ? <p className="mt-1 text-xs text-rose-600">{issueFor("weights")}</p> : null}
          </fieldset>
        ) : (
          <p className="mt-4 text-sm text-ink-600" data-weights-locked>
            {t(MANDATE_COPY.weightsLocked)}
          </p>
        ),
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={saving || !migrated || !canCreateMore}
          aria-busy={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-action hover:bg-action-hover text-on-action px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60"
          data-mandate-save
        >
          {saving ? t(MANDATE_COPY.saving) : t(MANDATE_COPY.save)}
        </button>
        <p className="text-xs text-ink-600" role="status" aria-live="polite" data-mandate-status={status.kind}>
          {status.kind === "saved" ? (status.created ? `${t(MANDATE_COPY.savedCreated)} ${t(MANDATE_COPY.saved)}` : t(MANDATE_COPY.saved)) : null}
          {status.kind === "invalid" ? t(MANDATE_COPY.invalid) : null}
          {status.kind === "failed" ? t(MANDATE_COPY.failed) : null}
          {status.kind === "limit" || !canCreateMore ? t(MANDATE_COPY.limit) : null}
          {status.kind === "not_migrated" ? t(MANDATE_COPY.notMigrated) : null}
          {status.kind === "locked" ? (
            <>
              {t(MANDATE_COPY.locked)}{" "}
              <a href="/pricing" className="font-semibold text-brand-600 hover:text-brand-700">
                {t(MANDATE_COPY.seePlans)}
              </a>
            </>
          ) : null}
        </p>
      </div>

      <p className="text-xs text-ink-500" data-data-principle>
        {DATA_PRINCIPLE_SENTENCE}
      </p>
      <p className="sr-only">{MANDATE_SECTIONS.length} sections</p>
    </form>
  );
}

export default MandateForm;
