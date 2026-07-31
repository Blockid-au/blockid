"use client";

// Reseller wholesale-provisioning form (client). POSTs to
// /api/reseller/create-startup with JSON so the response envelope surfaces
// inline instead of triggering a full page navigation. EN-only per U.15.13.

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  allowedTiers: number[];
}

interface ApiOk {
  ok: true;
  user_id: string;
  project_id: string;
  attribution_id: string;
  created_new_user: boolean;
  magic_link_sent: boolean;
  email_sent: boolean;
  stripe_wiring: "deferred";
  message: string;
}

interface ApiErr {
  ok: false;
  reason?: string;
  message?: string;
  detail?: string;
}

type ApiResponse = ApiOk | ApiErr;

export default function CreateStartupForm({ allowedTiers }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApiResponse | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const body = {
      founder_email: String(data.get("founder_email") ?? "").trim(),
      company_name: String(data.get("company_name") ?? "").trim(),
      plan_tier: String(data.get("plan_tier") ?? "founder_growth"),
      discount_tier: String(data.get("discount_tier") ?? ""),
      founder_name: String(data.get("founder_name") ?? "").trim() || undefined,
    };
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/reseller/create-startup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        credentials: "same-origin",
      });
      const json = (await res.json().catch(() => ({}))) as ApiResponse;
      setResult(json);
      if (json.ok) {
        form.reset();
        router.refresh();
      }
    } catch (err) {
      setResult({
        ok: false,
        reason: "network_error",
        message: (err as Error).message,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-surface-200 bg-white p-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Founder email
          </span>
          <input
            type="email"
            name="founder_email"
            required
            placeholder="founder@example.com"
            className="mt-1 block w-full rounded border border-surface-300 bg-white p-3 text-sm text-ink-900"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Company name
          </span>
          <input
            type="text"
            name="company_name"
            required
            maxLength={200}
            placeholder="Acme Pty Ltd"
            className="mt-1 block w-full rounded border border-surface-300 bg-white p-3 text-sm text-ink-900"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Founder name (optional)
          </span>
          <input
            type="text"
            name="founder_name"
            maxLength={120}
            placeholder="Jane Founder"
            className="mt-1 block w-full rounded border border-surface-300 bg-white p-3 text-sm text-ink-900"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Plan tier
          </span>
          <select
            name="plan_tier"
            defaultValue="founder_growth"
            className="mt-1 block w-full rounded border border-surface-300 bg-white p-3 text-sm text-ink-900"
          >
            <option value="founder_growth">Founder — Growth ($99/mo)</option>
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
            Discount tier
          </span>
          <select
            name="discount_tier"
            required
            className="mt-1 block w-full rounded border border-surface-300 bg-white p-3 text-sm text-ink-900"
          >
            {allowedTiers.length === 0 ? (
              <option value="">— no tiers configured —</option>
            ) : (
              allowedTiers.map((t) => (
                <option key={t} value={String(t)}>
                  {t === 0 ? "Attribution only (0%)" : `${t}% off forever`}
                </option>
              ))
            )}
          </select>
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-ink-500">
          POST <span className="font-mono">/api/reseller/create-startup</span>
        </p>
        <button
          type="submit"
          disabled={busy || allowedTiers.length === 0}
          className="rounded bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:bg-surface-200 disabled:text-ink-500"
        >
          {busy ? "Provisioning…" : "Provision startup"}
        </button>
      </div>

      {result && result.ok && (
        <div className="mt-4 rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-medium">Workspace provisioned.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              Project <code className="font-mono text-xs">{result.project_id}</code>{" "}
              created ({result.created_new_user ? "new" : "existing"} founder account).
            </li>
            <li>
              Magic-link email {result.email_sent ? "dispatched" : "queued (send deferred)"}.
              The founder has 24 hours to verify.
            </li>
            <li>
              Stripe subscription line: <span className="font-mono">{result.stripe_wiring}</span>{" "}
              — the reseller-side Stripe subscription create is deferred to a
              follow-up tick (needs <code className="font-mono text-xs">resellers.stripe_customer_id</code>{" "}
              schema + P8.5 env vars).
            </li>
          </ul>
        </div>
      )}

      {result && !result.ok && (
        <div className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          <p className="font-medium">Could not provision workspace.</p>
          <p className="mt-1">
            {result.message ?? result.reason ?? "Unknown error."}
          </p>
          {result.detail && (
            <p className="mt-1 text-xs text-red-700">{result.detail}</p>
          )}
        </div>
      )}
    </form>
  );
}
