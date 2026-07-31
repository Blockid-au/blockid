"use client";

// Workspace › Secondary Offer › intake form (client component).
//
// POSTs draft-intent parcels to /api/secondary-offer. The endpoint checks
// eligibility (SVI ≥ 80, governance ≥ 60) and either creates a new draft
// or updates an existing draft/live row for the same ticker.
//
// Rendered inline on /workspace/secondary-offer (T_SVI_EXC_0012 v0.5).
// Kept small on purpose — the wider deal-terms editor lives under the
// admin surface once an offer is promoted to `live`.

import * as React from "react";

interface FormState {
  ticker: string;
  slug: string;
  sharesForSale: string;
  priceLowAud: string;
  priceHighAud: string;
  lockUpMonths: string;
  buyerProfile: string;
  notes: string;
  ackDisclaimer: boolean;
  ackSophisticated: boolean;
}

const INITIAL_STATE: FormState = {
  ticker: "",
  slug: "",
  sharesForSale: "",
  priceLowAud: "",
  priceHighAud: "",
  lockUpMonths: "12",
  buyerProfile: "",
  notes: "",
  ackDisclaimer: false,
  ackSophisticated: false,
};

const TICKER_RE = /^[A-Z]{1,8}-[A-Z0-9]{1,8}$/;

function toNumberOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function SecondaryOfferIntakeForm(): React.ReactElement {
  const [form, setForm] = React.useState<FormState>(INITIAL_STATE);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{
    action: "created" | "updated";
    id: string;
  } | null>(null);

  const tickerValid = TICKER_RE.test(form.ticker.trim().toUpperCase());
  const sharesNum = toNumberOrNull(form.sharesForSale);
  const lowNum = toNumberOrNull(form.priceLowAud);
  const highNum = toNumberOrNull(form.priceHighAud);
  const priceBandOrdered =
    lowNum === null || highNum === null || highNum >= lowNum;
  const totalRaise =
    sharesNum && highNum ? sharesNum * highNum : null;

  const canSubmit =
    !submitting &&
    tickerValid &&
    sharesNum !== null &&
    sharesNum > 0 &&
    lowNum !== null &&
    highNum !== null &&
    lowNum > 0 &&
    priceBandOrdered &&
    form.buyerProfile.trim().length >= 20 &&
    form.ackDisclaimer &&
    form.ackSophisticated;

  const onSubmit = React.useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!canSubmit) return;
      setSubmitting(true);
      setError(null);
      try {
        const res = await fetch("/api/secondary-offer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            ticker: form.ticker.trim().toUpperCase(),
            slug: form.slug.trim() || undefined,
            shares_for_sale: sharesNum,
            price_band_low_aud: lowNum,
            price_band_high_aud: highNum,
            lock_up_months: toNumberOrNull(form.lockUpMonths) ?? 12,
            buyer_profile: form.buyerProfile.trim(),
            notes: form.notes.trim() || undefined,
          }),
        });
        const payload = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          action?: "created" | "updated";
          id?: string;
        };
        if (!res.ok || !payload.ok) {
          setError(payload.error ?? `Request failed (HTTP ${res.status})`);
          return;
        }
        setResult({
          action: payload.action ?? "created",
          id: payload.id ?? "",
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, form, sharesNum, lowNum, highNum],
  );

  if (result) {
    return (
      <section className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-slate-900 p-6">
        <div className="text-3xl">✓</div>
        <h2 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">
          Draft intent {result.action}
        </h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Your secondary offer is saved as{" "}
          <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[11px]">
            draft
          </code>{" "}
          (id <span className="font-mono text-xs">{result.id}</span>).
          Nothing is public. Our legal + CS team will review within 3
          business days before promoting to{" "}
          <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[11px]">
            live
          </code>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setForm(INITIAL_STATE);
          }}
          className="mt-4 rounded-lg border border-slate-300 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Submit another
        </button>
      </section>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6"
    >
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Submit intent
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          One draft per (ticker, status) tuple. Re-submitting updates the
          existing draft; you can revise until admin promotes it to{" "}
          <code>live</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="ticker"
            className="block text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            Ticker
          </label>
          <input
            id="ticker"
            type="text"
            required
            placeholder="AU-ACME"
            value={form.ticker}
            onChange={(e) =>
              setForm((p) => ({ ...p, ticker: e.target.value.toUpperCase() }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
          {form.ticker && !tickerValid && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
              Must match <code>COUNTRY-COMPANY</code> (e.g. <code>AU-ACME</code>).
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="slug"
            className="block text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            Slug (optional)
          </label>
          <input
            id="slug"
            type="text"
            placeholder="acme-pty-ltd"
            value={form.slug}
            onChange={(e) =>
              setForm((p) => ({ ...p, slug: e.target.value.toLowerCase() }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="shares"
            className="block text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            Shares for sale
          </label>
          <input
            id="shares"
            type="number"
            min={1}
            step={1}
            required
            value={form.sharesForSale}
            onChange={(e) =>
              setForm((p) => ({ ...p, sharesForSale: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="lockup"
            className="block text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            Lock-up months
          </label>
          <input
            id="lockup"
            type="number"
            min={0}
            step={1}
            value={form.lockUpMonths}
            onChange={(e) =>
              setForm((p) => ({ ...p, lockUpMonths: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="low"
            className="block text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            Price band low (AUD)
          </label>
          <input
            id="low"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.priceLowAud}
            onChange={(e) =>
              setForm((p) => ({ ...p, priceLowAud: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
        </div>

        <div>
          <label
            htmlFor="high"
            className="block text-sm font-medium text-slate-900 dark:text-slate-100"
          >
            Price band high (AUD)
          </label>
          <input
            id="high"
            type="number"
            min={0}
            step="0.01"
            required
            value={form.priceHighAud}
            onChange={(e) =>
              setForm((p) => ({ ...p, priceHighAud: e.target.value }))
            }
            className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          />
          {!priceBandOrdered && (
            <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">
              High must be ≥ low.
            </p>
          )}
        </div>
      </div>

      {totalRaise !== null && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Indicative max raise (shares × high):{" "}
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            A${totalRaise.toLocaleString("en-AU", { maximumFractionDigits: 2 })}
          </span>
        </p>
      )}

      <div>
        <label
          htmlFor="buyer"
          className="block text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          Ideal buyer profile
        </label>
        <textarea
          id="buyer"
          required
          minLength={20}
          maxLength={2000}
          rows={3}
          placeholder="Strategic angel or family office with AU tech exposure, 5-year horizon…"
          value={form.buyerProfile}
          onChange={(e) =>
            setForm((p) => ({ ...p, buyerProfile: e.target.value }))
          }
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
        />
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {form.buyerProfile.length} / 2000 · min 20 characters
        </p>
      </div>

      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-slate-900 dark:text-slate-100"
        >
          Internal notes (optional)
        </label>
        <textarea
          id="notes"
          maxLength={2000}
          rows={2}
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
          className="mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
        />
      </div>

      <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-4">
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={form.ackDisclaimer}
            onChange={(e) =>
              setForm((p) => ({ ...p, ackDisclaimer: e.target.checked }))
            }
            className="mt-0.5"
          />
          <span>
            I have read the disclaimer above and understand that this
            submission is a <em>draft intent</em> — not an offer of
            securities.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={form.ackSophisticated}
            onChange={(e) =>
              setForm((p) => ({ ...p, ackSophisticated: e.target.checked }))
            }
            className="mt-0.5"
          />
          <span>
            I understand this parcel will only be shown to
            sophisticated/professional investors under s708(8) or s708(11) of
            the Corporations Act 2001 (Cth).
          </span>
        </label>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-800 dark:text-rose-200"
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50 text-white px-4 py-2 text-sm font-semibold transition-colors"
      >
        {submitting ? "Submitting…" : "Submit draft intent"}
      </button>
    </form>
  );
}
