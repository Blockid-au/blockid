"use client";

import { useState } from "react";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

const AU_STATES = [
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA",  label: "Western Australia" },
  { value: "SA",  label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT",  label: "Northern Territory" },
] as const;

const INDUSTRIES = [
  { value: "fintech",     label: "Fintech" },
  { value: "saas",        label: "SaaS" },
  { value: "ai",          label: "AI / ML" },
  { value: "healthtech",  label: "Healthtech" },
  { value: "marketplace", label: "Marketplace" },
  { value: "deeptech",    label: "Deep Tech" },
  { value: "ecommerce",   label: "E-commerce" },
  { value: "other",       label: "Other" },
] as const;

const STAGES = [
  { value: "idea",    label: "Idea / Pre-product" },
  { value: "mvp",     label: "MVP / Beta" },
  { value: "revenue", label: "Revenue (early)" },
  { value: "growth",  label: "Growth" },
  { value: "scale",   label: "Scale / Series A+" },
] as const;

const FIELD_CLASS =
  "w-full px-4 py-3 rounded-lg border border-white/20 bg-white/10 text-[var(--fintech-ink)] " +
  "placeholder:text-[var(--fintech-ink-muted)] focus:outline-none focus:ring-2 " +
  "focus:ring-[var(--fintech-accent)] focus:border-transparent transition-colors";

const LABEL_CLASS = "block text-sm font-medium text-[var(--fintech-ink)] mb-1.5";

export function SubmitForm() {
  const [fields, setFields] = useState({
    startup_name:     "",
    tagline:          "",
    state:            "",
    industry:         "",
    stage:            "",
    website_url:      "",
    contact_email:    "",
    is_public_opt_in: true,
  });
  const [loading, setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]       = useState("");

  function set(key: keyof typeof fields, value: string | boolean) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = {
        ...fields,
        website_url: fields.website_url.trim() || undefined,
        state:       fields.state   || undefined,
        industry:    fields.industry || undefined,
        stage:       fields.stage   || undefined,
      };

      const res = await fetch("/api/index/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json() as { ok?: boolean; error?: string };

      if (!res.ok) {
        throw new Error(data.error ?? "Submission failed — please try again.");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <CheckCircle className="h-14 w-14 text-[var(--fintech-accent)]" />
        <h2 className="text-2xl font-bold text-[var(--fintech-ink-strong)]">
          Submission received!
        </h2>
        <p className="max-w-md text-[var(--fintech-ink-muted)]">
          We&apos;ll review your startup and list it on the AU Startup Public Index within 24 hours. Keep an eye on your inbox.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Startup name */}
      <div>
        <label htmlFor="startup_name" className={LABEL_CLASS}>
          Startup name <span className="text-[var(--fintech-accent)]">*</span>
        </label>
        <input
          id="startup_name"
          type="text"
          placeholder="e.g. AcmeFintech"
          required
          value={fields.startup_name}
          onChange={(e) => set("startup_name", e.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      {/* Tagline */}
      <div>
        <label htmlFor="tagline" className={LABEL_CLASS}>
          One-line tagline <span className="text-[var(--fintech-accent)]">*</span>
          <span className="ml-2 text-xs text-[var(--fintech-ink-muted)] font-normal">
            max 120 chars
          </span>
        </label>
        <input
          id="tagline"
          type="text"
          placeholder="e.g. Frictionless payments for AU SMEs"
          required
          maxLength={120}
          value={fields.tagline}
          onChange={(e) => set("tagline", e.target.value)}
          className={FIELD_CLASS}
        />
        <p className="mt-1 text-xs text-[var(--fintech-ink-muted)] text-right">
          {fields.tagline.length}/120
        </p>
      </div>

      {/* State + Industry (2-col on md+) */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <label htmlFor="state" className={LABEL_CLASS}>State</label>
          <select
            id="state"
            value={fields.state}
            onChange={(e) => set("state", e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Select a state</option>
            {AU_STATES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="industry" className={LABEL_CLASS}>Industry</label>
          <select
            id="industry"
            value={fields.industry}
            onChange={(e) => set("industry", e.target.value)}
            className={FIELD_CLASS}
          >
            <option value="">Select an industry</option>
            {INDUSTRIES.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stage */}
      <div>
        <label htmlFor="stage" className={LABEL_CLASS}>Stage</label>
        <select
          id="stage"
          value={fields.stage}
          onChange={(e) => set("stage", e.target.value)}
          className={FIELD_CLASS}
        >
          <option value="">Select a stage</option>
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Website URL */}
      <div>
        <label htmlFor="website_url" className={LABEL_CLASS}>
          Website URL{" "}
          <span className="text-xs text-[var(--fintech-ink-muted)] font-normal">optional</span>
        </label>
        <input
          id="website_url"
          type="url"
          placeholder="https://yourstartup.com.au"
          value={fields.website_url}
          onChange={(e) => set("website_url", e.target.value)}
          className={FIELD_CLASS}
        />
      </div>

      {/* Contact email */}
      <div>
        <label htmlFor="contact_email" className={LABEL_CLASS}>
          Email address <span className="text-[var(--fintech-accent)]">*</span>
        </label>
        <input
          id="contact_email"
          type="email"
          placeholder="founder@yourstartup.com.au"
          required
          value={fields.contact_email}
          onChange={(e) => set("contact_email", e.target.value)}
          className={FIELD_CLASS}
        />
        <p className="mt-1 text-xs text-[var(--fintech-ink-muted)]">
          We&apos;ll notify you when your listing goes live. Never shared publicly.
        </p>
      </div>

      {/* Public opt-in */}
      <div className="flex items-start gap-3">
        <input
          id="is_public_opt_in"
          type="checkbox"
          checked={fields.is_public_opt_in}
          onChange={(e) => set("is_public_opt_in", e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-white/30 accent-[var(--fintech-accent)]"
        />
        <label htmlFor="is_public_opt_in" className="text-sm text-[var(--fintech-ink-muted)] leading-relaxed">
          List my startup on the AU Startup Public Index so investors and founders can discover us.
          You can request removal at any time.
        </label>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-[var(--fintech-accent)] px-6 py-3.5 font-semibold text-[var(--fintech-bg-primary)] hover:bg-[var(--fintech-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit your startup"
        )}
      </button>

      <p className="text-xs text-center text-[var(--fintech-ink-muted)]">
        Free forever. Review takes up to 24 hours.
      </p>
    </form>
  );
}
