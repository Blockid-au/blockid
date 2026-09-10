"use client";

/**
 * FundingIntake — the 3-question Money Finder intake on /funding (T0242,
 * plan §4a / §4f).
 *
 *   what are you building · state · stage   →  POST /api/funding/preview
 *   + "improve my match" drawer (industry, founder groups, A$ figures)
 *   → free preview (counts, top-3 with a why, "up to A$X", locked details)
 *   → paywall card (FundingPaywall: guest A$3 · 3 credits · included in plan)
 *
 * Prefill: `?intent=`, `?grant=<name>`, `?program=<name>`, `?state=`,
 * `?stage=` are read from `window.location` after hydration so the server
 * page stays ISR-cacheable (no `useSearchParams`, no Suspense bailout).
 *
 * GA4: `funding_preview` on a successful preview; `funding_paywall_hit` when
 * the card renders (rail = anonymous / guest / credits / plan).
 */

import * as React from "react";
import { ChevronDown, Lock, Sparkles } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useEntitlement } from "@/hooks/useEntitlement";
import {
  DEMOGRAPHIC_TOGGLES,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  INDUSTRY_OPTIONS,
  INTAKE_STAGES,
  INTAKE_STATES,
  NOT_INCORPORATED,
  STATE_OPTIONS,
  type DemographicToggle,
  type IntakeState,
} from "@/lib/funding/intake";
import type { FundingPreviewPayload } from "@/lib/funding/preview";
import { formatAudCompact } from "@/lib/funding/directory";
import type { FounderStage } from "@/lib/agents/grant-advisor-rules";
import { FundingPaywall, type PaywallRail } from "./funding-paywall";

export interface FundingIntakeProps {
  openGrantCount: number;
  openProgramCount: number;
}

interface FormState {
  description: string;
  state: IntakeState | "";
  based_state: string;
  stage: FounderStage | "";
  industry_tags: string[];
  toggles: Record<DemographicToggle, boolean>;
  turnover_aud: string;
  rd_spend_aud: string;
  incorporated_year: string;
  headcount: string;
  export_intent: boolean;
}

const EMPTY: FormState = {
  description: "",
  state: "",
  based_state: "",
  stage: "",
  industry_tags: [],
  toggles: { women_led: false, indigenous_owned: false, regional: false, under_30: false },
  turnover_aud: "",
  rd_spend_aud: "",
  incorporated_year: "",
  headcount: "",
  export_intent: false,
};

const FIELD =
  "w-full rounded-lg border border-line-subtle bg-surface px-3 py-2.5 text-sm text-primary placeholder:text-tertiary focus:border-action focus:outline-none focus:ring-2 focus:ring-action/30";

/** Build the intake body the API expects from the form state. Exported for tests. */
export function toIntakeBody(f: FormState): Record<string, unknown> {
  return {
    description: f.description.trim(),
    state: f.state,
    based_state: f.state === NOT_INCORPORATED && f.based_state ? f.based_state : null,
    stage: f.stage,
    industry_tags: f.industry_tags,
    ...f.toggles,
    turnover_aud: f.turnover_aud || null,
    rd_spend_aud: f.rd_spend_aud || null,
    incorporated_year: f.incorporated_year || null,
    headcount: f.headcount || null,
    export_intent: f.export_intent,
  };
}

/** `?intent=` / `?grant=` / `?program=` / `?state=` / `?stage=` → initial form values. Exported for tests. */
export function prefillFromSearch(search: string): Partial<FormState> {
  const q = new URLSearchParams(search);
  const out: Partial<FormState> = {};
  const intent = q.get("intent")?.trim();
  const grant = q.get("grant")?.trim();
  const program = q.get("program")?.trim();
  if (intent) out.description = intent.slice(0, DESCRIPTION_MAX);
  else if (grant) out.description = `We want to apply for ${grant.slice(0, 120)}. We are building `;
  else if (program) out.description = `We want to join ${program.slice(0, 120)}. We are building `;
  const state = q.get("state")?.trim().toUpperCase();
  if (state && (INTAKE_STATES as readonly string[]).includes(state)) out.state = state as IntakeState;
  const stage = q.get("stage")?.trim().toLowerCase();
  if (stage && INTAKE_STAGES.some((s) => s.value === stage)) out.stage = stage as FounderStage;
  return out;
}

export function FundingIntake({ openGrantCount, openProgramCount }: FundingIntakeProps) {
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [drawer, setDrawer] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<FundingPreviewPayload | null>(null);
  const [submitted, setSubmitted] = React.useState<Record<string, unknown> | null>(null);
  const previewRef = React.useRef<HTMLDivElement | null>(null);
  const prefilled = React.useRef(false);

  const user = useAuthUser();
  const { can, isLoading: entLoading } = useEntitlement();

  // Prefill from the URL once, after hydration (keeps the page static).
  React.useEffect(() => {
    if (prefilled.current || typeof window === "undefined") return;
    prefilled.current = true;
    const p = prefillFromSearch(window.location.search);
    if (Object.keys(p).length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off URL prefill after hydration
    setForm((f) => ({ ...f, ...p }));
  }, []);

  const rail: PaywallRail = React.useMemo(() => {
    if (user === undefined || entLoading) return "anonymous";
    if (!user) return "guest";
    return can("grant_finder") ? "plan" : "credits";
  }, [user, entLoading, can]);

  const descriptionOk = form.description.trim().length >= DESCRIPTION_MIN;
  const canSubmit = descriptionOk && form.state !== "" && form.stage !== "" && !loading;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const body = toIntakeBody(form);
    try {
      const res = await fetch("/api/funding/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { ok: boolean; preview?: FundingPreviewPayload; error?: string };
      if (!res.ok || !data.ok || !data.preview) {
        setError(data.error ?? "Something went wrong — try again in a moment.");
        return;
      }
      setPreview(data.preview);
      setSubmitted(body);
      trackEvent("funding_preview", {
        state: String(form.state),
        stage: String(form.stage),
        grant_count: data.preview.grant_count,
        program_count: data.preview.program_count,
      });
      window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch {
      setError("Network error — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id="intake" className="mx-auto max-w-5xl px-6 py-12" aria-labelledby="funding-intake-heading">
      <div className="rounded-2xl border border-line-subtle bg-surface-raised p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-action">Three questions · free preview</p>
        <h2 id="funding-intake-heading" className="mt-1 font-display text-2xl font-semibold text-primary sm:text-3xl">
          What could you apply for this year?
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-secondary">
          {openGrantCount} grants and {openProgramCount} programs are open right now. Tell us three things and
          we match them to you — the list is free, the analysis is A$3.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-5" noValidate data-funding-intake>
          <div>
            <label htmlFor="fi-description" className="block text-sm font-semibold text-primary">
              1. What are you building?
            </label>
            <textarea
              id="fi-description"
              name="description"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              maxLength={DESCRIPTION_MAX}
              placeholder="e.g. A soil-sensor subscription for grain farmers in regional NSW — prototype in the field with 3 growers, applying for R&D and looking at accelerators."
              className={`${FIELD} min-h-[110px] resize-y`}
              aria-describedby="fi-description-help"
              required
            />
            <p id="fi-description-help" className="mt-1 text-xs text-tertiary">
              {descriptionOk
                ? `${form.description.trim().length}/${DESCRIPTION_MAX}`
                : `${Math.max(0, DESCRIPTION_MIN - form.description.trim().length)} more characters`}{" "}
              · one or two sentences is enough
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="fi-state" className="block text-sm font-semibold text-primary">
                2. Where is the company registered?
              </label>
              <select
                id="fi-state"
                name="state"
                value={form.state}
                onChange={(e) => set("state", e.target.value as IntakeState)}
                className={`${FIELD} mt-1`}
                required
              >
                <option value="" disabled>
                  Choose a state or territory
                </option>
                {STATE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              {form.state === NOT_INCORPORATED ? (
                <div className="mt-2">
                  <label htmlFor="fi-based" className="block text-xs font-medium text-secondary">
                    Where are you based? (state grants still count before you incorporate)
                  </label>
                  <select
                    id="fi-based"
                    name="based_state"
                    value={form.based_state}
                    onChange={(e) => set("based_state", e.target.value)}
                    className={`${FIELD} mt-1`}
                  >
                    <option value="">Not sure yet — national schemes only</option>
                    {STATE_OPTIONS.filter((o) => o.value !== NOT_INCORPORATED).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <fieldset>
              <legend className="block text-sm font-semibold text-primary">3. What stage are you at?</legend>
              <div className="mt-1 grid gap-1.5">
                {INTAKE_STAGES.map((s) => (
                  <label
                    key={s.value}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                      form.stage === s.value ? "border-action bg-action/10 text-primary" : "border-line-subtle text-secondary hover:border-line"
                    }`}
                  >
                    <input
                      type="radio"
                      name="stage"
                      value={s.value}
                      checked={form.stage === s.value}
                      onChange={() => set("stage", s.value)}
                      className="accent-action"
                    />
                    <span className="font-medium">{s.label}</span>
                    <span className="text-xs text-tertiary">— {s.hint}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          <div className="rounded-xl border border-dashed border-line-subtle">
            <button
              type="button"
              onClick={() => setDrawer((d) => !d)}
              aria-expanded={drawer}
              aria-controls="fi-drawer"
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-primary"
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-action" aria-hidden /> Improve my match (optional)
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${drawer ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {drawer ? (
              <div id="fi-drawer" className="space-y-5 border-t border-line-subtle px-4 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Industry (pick up to 6)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {INDUSTRY_OPTIONS.map((o) => {
                      const on = form.industry_tags.includes(o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            set(
                              "industry_tags",
                              on ? form.industry_tags.filter((t) => t !== o.value) : [...form.industry_tags, o.value].slice(0, 6),
                            )
                          }
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                            on ? "border-action bg-action text-on-action" : "border-line-subtle bg-surface text-primary hover:border-line"
                          }`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Founder groups</p>
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2">
                    {DEMOGRAPHIC_TOGGLES.map((t) => (
                      <label key={t.key} className="inline-flex items-center gap-2 text-sm text-primary">
                        <input
                          type="checkbox"
                          name={t.key}
                          checked={form.toggles[t.key]}
                          onChange={(e) => set("toggles", { ...form.toggles, [t.key]: e.target.checked })}
                          className="accent-action"
                        />
                        {t.label}
                      </label>
                    ))}
                    <label className="inline-flex items-center gap-2 text-sm text-primary">
                      <input
                        type="checkbox"
                        name="export_intent"
                        checked={form.export_intent}
                        onChange={(e) => set("export_intent", e.target.checked)}
                        className="accent-action"
                      />
                      Planning to export
                    </label>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-4">
                  <NumberField id="fi-turnover" label="Turnover (A$, last 12 mo)" value={form.turnover_aud} onChange={(v) => set("turnover_aud", v)} placeholder="0" />
                  <NumberField id="fi-rd" label="R&D spend (A$)" value={form.rd_spend_aud} onChange={(v) => set("rd_spend_aud", v)} placeholder="0" />
                  <NumberField id="fi-year" label="Incorporated (year)" value={form.incorporated_year} onChange={(v) => set("incorporated_year", v)} placeholder="2025" />
                  <NumberField id="fi-headcount" label="Headcount" value={form.headcount} onChange={(v) => set("headcount", v)} placeholder="2" />
                </div>
                <p className="text-xs text-tertiary">
                  Figures switch the R&amp;D Tax Incentive and ESIC estimates on. Leave blank and those rows show as
                  &ldquo;unknown&rdquo; instead of &ldquo;ineligible&rdquo;.
                </p>
              </div>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="rounded-lg border border-bear/30 bg-bear/10 px-3 py-2 text-sm text-bear">
              {error}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex items-center justify-center rounded-lg bg-action px-6 py-3 text-sm font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Matching…" : preview ? "Update my preview" : "Show my matches — free"}
            </button>
            <span className="text-xs text-tertiary">No signup. Nothing is stored until you buy a report.</span>
          </div>
        </form>
      </div>

      {preview && submitted ? (
        <div ref={previewRef} className="mt-8 scroll-mt-24">
          <FundingPreviewCard preview={preview} />
          <FundingPaywall intake={submitted} preview={preview} rail={rail} />
        </div>
      ) : null}
    </section>
  );
}

function NumberField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-secondary">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        placeholder={placeholder}
        className={`${FIELD} mt-1`}
      />
    </div>
  );
}

/** The free tier of the result: counts, top-3 names + why, hero A$, locked rows. */
export function FundingPreviewCard({ preview }: { preview: FundingPreviewPayload }) {
  const fb = preview.fallback;
  const headline =
    preview.grant_count > 0 || preview.program_count > 0
      ? `We found ${preview.grant_count} ${preview.grant_count === 1 ? "grant" : "grants"}${
          preview.top_grants_amount_max_aud > 0 ? ` (up to ${formatAudCompact(preview.top_grants_amount_max_aud)} across the top five)` : ""
        } and ${preview.program_count} ${preview.program_count === 1 ? "program" : "programs"} matching you.`
      : "No exact matches yet — here is the nearest national money.";

  const grants = fb ? fb.grants : preview.top_grants;
  const programs = fb ? fb.programs : preview.top_programs;

  return (
    <div className="rounded-2xl border border-line-subtle bg-surface p-6 sm:p-8" data-funding-preview>
      <p className="text-xs font-semibold uppercase tracking-wide text-action">Your free preview</p>
      <h3 className="mt-1 font-display text-xl font-semibold text-primary sm:text-2xl">{headline}</h3>
      {fb ? <p className="mt-2 text-sm text-secondary">{fb.reason}</p> : null}
      {preview.location_unknown ? (
        <p className="mt-2 text-xs text-tertiary">
          You have not told us where you are based, so only national schemes are shown. Pick a state to add state grants and
          in-person programs.
        </p>
      ) : null}

      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <PreviewList title={fb ? "National grants open now" : "Top grants"} items={grants} empty="No grants match yet — the directory is still free to browse." />
        <PreviewList title={fb ? "National / remote programs" : "Top programs"} items={programs} empty="No programs match yet — try a different stage or city." />
      </div>

      <ul className="mt-6 grid gap-2 text-sm text-secondary sm:grid-cols-3" aria-label="What the full report adds">
        <LockedRow label={`Full ranked list (${preview.grant_count + preview.program_count} rows) with scores`} />
        <LockedRow label={`Eligibility checklist — ${preview.locked.checklist_items} checks, ✓ / ✗ / ?`} />
        <LockedRow label={`12-month timeline — ${preview.locked.timeline_items} dated actions`} />
        <LockedRow label={preview.locked.estimates > 0 ? `${preview.locked.estimates} A$ estimates (R&DTI / ESIC)` : "A$ estimates where a calculator exists"} />
        <LockedRow label="Next 3 actions, written for you" />
        <LockedRow label="Official links + last-verified dates on every row" />
      </ul>
    </div>
  );
}

function PreviewList({ title, items, empty }: { title: string; items: Array<{ name: string; why: string }>; empty: string }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-primary">{title}</h4>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-tertiary">{empty}</p>
      ) : (
        <ol className="mt-2 space-y-2">
          {items.map((m, i) => (
            <li key={`${m.name}-${i}`} className="rounded-lg border border-line-subtle bg-surface-raised px-3 py-2">
              <p className="text-sm font-semibold text-primary">
                {i + 1}. {m.name}
              </p>
              <p className="text-xs text-secondary">{m.why}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function LockedRow({ label }: { label: string }) {
  return (
    <li className="inline-flex items-start gap-2">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-tertiary" aria-hidden />
      <span>{label}</span>
    </li>
  );
}

export default FundingIntake;
