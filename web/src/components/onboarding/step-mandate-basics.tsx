"use client";

// Step 2 (evaluator) · "Your mandate" — G13-W4-IA4 (spec §B.3 row 2).
//
// The mandate BASICS only — sectors · stages · geographies (AU states +
// wide scopes) · cheque band · minimum SVI — using the startup taxonomy the
// 7-section form at /workspace/investor/mandate uses, so the row saved here
// IS that mandate (PUT /api/investor/mandates, kind by persona). A plan
// without `investor.dealflow` (402) or an unmigrated host (503) parks the
// basics in wizard state and lets the user continue — value first, paywall
// after (the landing's block 4 picks the setup up).

import * as React from "react";
import { ArrowRight, Loader2, SlidersHorizontal, SkipForward } from "lucide-react";
import { useLocale, type Locale } from "@/lib/use-locale";
import { CANONICAL_STAGES, CANONICAL_STAGE_LABELS } from "@/lib/journey-vocabulary";
import { industryLabel, type Industry } from "@/lib/taxonomy/startup-taxonomy";
import { MANDATE_GEOGRAPHIES, MANDATE_INDUSTRIES } from "@/lib/investors/mandates-shared";
import type { WizardPersona } from "@/lib/onboarding/flow";
import { EMPTY_MANDATE_BASICS, type MandateBasics } from "./wizard-v4";

const COPY: Record<Locale, Record<string, string>> = {
  en: {
    title: "Your mandate",
    subtitle: "Sectors, stages, states and cheque size. Every consenting startup is scored against this nightly — you can refine all seven sections later.",
    sectors: "Sectors",
    stages: "Stages",
    geos: "Geography",
    cheque: "Cheque size (A$)",
    chequeMin: "From",
    chequeMax: "To",
    minSvi: "Minimum SVI (0–100)",
    save: "Save mandate",
    saving: "Saving…",
    skip: "Set this up later",
    parked: "Saved for later — your plan does not include deal flow yet, so the mandate is kept with your setup and applied when you upgrade.",
    notMigrated: "Mandates are not enabled on this environment yet — your choices are kept with your setup.",
    failed: "Couldn't save the mandate — please try again.",
    pickOne: "Pick at least one sector or stage, or skip for now.",
    continue: "Continue",
    savedTitle: "Mandate saved.",
  },
  vi: {
    title: "Khẩu vị đầu tư",
    subtitle: "Ngành, giai đoạn, bang và quy mô séc. Mọi startup đồng ý chia sẻ được chấm theo khẩu vị này hằng đêm — bạn có thể tinh chỉnh cả 7 phần sau.",
    sectors: "Ngành",
    stages: "Giai đoạn",
    geos: "Địa lý",
    cheque: "Quy mô séc (A$)",
    chequeMin: "Từ",
    chequeMax: "Đến",
    minSvi: "SVI tối thiểu (0–100)",
    save: "Lưu khẩu vị",
    saving: "Đang lưu…",
    skip: "Thiết lập sau",
    parked: "Đã lưu để dùng sau — gói của bạn chưa gồm deal flow, khẩu vị sẽ được áp dụng khi nâng cấp.",
    notMigrated: "Khẩu vị chưa được bật trên môi trường này — lựa chọn của bạn được giữ cùng thiết lập.",
    failed: "Không thể lưu khẩu vị — vui lòng thử lại.",
    pickOne: "Chọn ít nhất một ngành hoặc giai đoạn, hoặc bỏ qua.",
    continue: "Tiếp tục",
    savedTitle: "Đã lưu khẩu vị.",
  },
};

const GEO_LABEL: Record<string, string> = { national: "All of Australia", anz: "ANZ", apac: "APAC", global: "Global" };

/** Mandate kind for the persona (mirrors MANDATE_KINDS). */
export function mandateKindFor(persona: WizardPersona | undefined): "angel" | "vc" | "accelerator" {
  if (persona === "investor_vc") return "vc";
  if (persona === "accelerator") return "accelerator";
  return "angel";
}

/** Pure: the PUT body for /api/investor/mandates from the basics (pinned by the wizard test). */
export function mandateBodyFromBasics(basics: MandateBasics, persona: WizardPersona | undefined, label = "My mandate") {
  return {
    label,
    kind: mandateKindFor(persona),
    is_default: true,
    sectors_include: basics.sectors,
    stages: basics.stages,
    geographies: basics.geographies,
    cheque_min_aud: basics.cheque_min_aud,
    cheque_max_aud: basics.cheque_max_aud,
    min_svi: basics.min_svi,
  };
}

export function hasAnyBasics(b: MandateBasics): boolean {
  return b.sectors.length > 0 || b.stages.length > 0 || b.geographies.length > 0 || b.cheque_min_aud !== null || b.cheque_max_aud !== null || b.min_svi !== null;
}

export interface StepMandateBasicsProps {
  persona: WizardPersona | undefined;
  existing?: { mandateId?: string; basics?: MandateBasics; parked?: boolean };
  onSaved: (r: { mandateId?: string; basics: MandateBasics; parked?: boolean }) => void;
  onSkip: () => void;
  onContinue: () => void;
}

export function StepMandateBasics({ persona, existing, onSaved, onSkip, onContinue }: StepMandateBasicsProps) {
  const [locale] = useLocale();
  const t = COPY[locale];
  const [b, setB] = React.useState<MandateBasics>(existing?.basics ?? EMPTY_MANDATE_BASICS);
  const [status, setStatus] = React.useState<"idle" | "saving" | "invalid" | "failed" | "parked" | "not_migrated">(existing?.parked ? "parked" : "idle");
  const uid = React.useId();

  const toggle = (k: "sectors" | "stages" | "geographies", v: string) =>
    setB((prev) => ({ ...prev, [k]: prev[k].includes(v) ? prev[k].filter((x) => x !== v) : [...prev[k], v] }));
  const num = (v: string): number | null => {
    const n = Number(v.replace(/[^0-9.]/g, ""));
    return v.trim() === "" || !Number.isFinite(n) ? null : n;
  };

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    if (status === "saving") return;
    if (!hasAnyBasics(b)) {
      setStatus("invalid");
      return;
    }
    setStatus("saving");
    try {
      const res = await fetch("/api/investor/mandates", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mandateBodyFromBasics(b, persona)),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; mandate?: { id?: string } };
      if (res.status === 402) {
        setStatus("parked");
        onSaved({ basics: b, parked: true });
        return;
      }
      if (res.status === 503 || data.error === "not_migrated") {
        setStatus("not_migrated");
        onSaved({ basics: b, parked: true });
        return;
      }
      if (!res.ok || !data.ok) {
        setStatus("failed");
        return;
      }
      onSaved({ mandateId: data.mandate?.id, basics: b });
    } catch {
      setStatus("failed");
    }
  }

  const chipOn = "cursor-pointer rounded-full border border-brand-cyan bg-brand-cyan/15 px-3 py-1 text-xs font-medium text-brand-ink";
  const chipOff = "cursor-pointer rounded-full border border-brand-cyan/15 bg-brand-navy-elev-1 px-3 py-1 text-xs font-medium text-brand-ink-muted hover:border-brand-cyan/40";
  const input = "mt-1 w-full rounded-xl border border-brand-cyan/15 bg-brand-navy-elev-1 px-3 py-2 text-sm text-brand-ink focus:border-brand-cyan focus:outline-none focus:ring-2 focus:ring-brand-cyan/30";

  const chips = (k: "sectors" | "stages" | "geographies", values: readonly string[], label: (v: string) => string, legend: string) => (
    <fieldset>
      <legend className="text-sm font-medium text-brand-ink">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2" data-chips={k}>
        {values.map((v) => {
          const id = `${uid}-${k}-${v}`;
          const on = b[k].includes(v);
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
    </fieldset>
  );

  if (existing?.mandateId) {
    return (
      <div data-wizard-step="mandate" data-mandate-saved={existing.mandateId}>
        <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{t.title}</h1>
        <p className="mt-2 text-brand-ink-muted">{t.savedTitle}</p>
        <div className="mt-8 flex justify-end">
          <button type="button" onClick={onContinue} data-testid="wizard-continue" className="inline-flex items-center gap-2 rounded-xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-blue-bright">
            {t.continue}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div data-wizard-step="mandate">
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">{t.title}</h1>
      <p className="mt-2 text-brand-ink-muted">{t.subtitle}</p>
      <form onSubmit={submit} className="mt-8 space-y-6">
        {chips("sectors", MANDATE_INDUSTRIES, (v) => industryLabel(v as Industry, locale), t.sectors)}
        {chips("stages", CANONICAL_STAGES, (v) => CANONICAL_STAGE_LABELS[v as keyof typeof CANONICAL_STAGE_LABELS]?.[locale === "vi" ? "label_vi" : "label_en"] ?? v, t.stages)}
        {chips("geographies", MANDATE_GEOGRAPHIES, (v) => GEO_LABEL[v] ?? v, t.geos)}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor={`${uid}-min`} className="block text-sm font-medium text-brand-ink">{t.cheque} · {t.chequeMin}</label>
            <input id={`${uid}-min`} inputMode="numeric" value={b.cheque_min_aud ?? ""} onChange={(e) => setB((p) => ({ ...p, cheque_min_aud: num(e.target.value) }))} placeholder="25000" className={input} />
          </div>
          <div>
            <label htmlFor={`${uid}-max`} className="block text-sm font-medium text-brand-ink">{t.cheque} · {t.chequeMax}</label>
            <input id={`${uid}-max`} inputMode="numeric" value={b.cheque_max_aud ?? ""} onChange={(e) => setB((p) => ({ ...p, cheque_max_aud: num(e.target.value) }))} placeholder="250000" className={input} />
          </div>
          <div>
            <label htmlFor={`${uid}-svi`} className="block text-sm font-medium text-brand-ink">{t.minSvi}</label>
            <input id={`${uid}-svi`} inputMode="numeric" value={b.min_svi ?? ""} onChange={(e) => setB((p) => ({ ...p, min_svi: num(e.target.value) === null ? null : Math.min(100, Math.max(0, Math.round(num(e.target.value) as number))) }))} placeholder="50" className={input} />
          </div>
        </div>

        {status === "invalid" ? <p role="alert" className="text-sm text-red-400">{t.pickOne}</p> : null}
        {status === "failed" ? <p role="alert" className="text-sm text-red-400">{t.failed}</p> : null}
        {status === "parked" ? <p role="status" className="text-sm text-brand-ink-muted" data-mandate-parked>{t.parked}</p> : null}
        {status === "not_migrated" ? <p role="status" className="text-sm text-brand-ink-muted" data-mandate-parked>{t.notMigrated}</p> : null}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onSkip} disabled={status === "saving"} data-testid="wizard-skip" className="inline-flex items-center gap-2 rounded-lg px-2 py-2 text-sm font-medium text-brand-ink-muted underline decoration-brand-ink-muted/40 underline-offset-4 hover:text-brand-cyan disabled:opacity-40">
            <SkipForward aria-hidden="true" className="h-4 w-4" />
            {t.skip}
          </button>
          {status === "parked" || status === "not_migrated" ? (
            <button type="button" onClick={onContinue} data-testid="wizard-continue" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-blue-bright">
              {t.continue}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          ) : (
            <button type="submit" disabled={status === "saving"} data-testid="wizard-continue" className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy hover:bg-brand-blue-bright disabled:opacity-40">
              {status === "saving" ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <SlidersHorizontal aria-hidden="true" className="h-4 w-4" />}
              {status === "saving" ? t.saving : t.save}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
