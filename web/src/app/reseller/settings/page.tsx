// GET /reseller/settings — read-only reseller org profile.
//
// Per docs/plans/reseller-module-plan.md § C.1.7.
// Uses the typed resellerSupabase() wrapper — never touches admin client.
//
// Self-service edit is intentionally NOT wired here: any change to
// billing_model / allowed_tiers / commission_share_pct / can_grant_credits
// affects APP consent + commission accounting and must land via a BlockID
// admin flow. Resellers see the "Contact BlockID to edit" note instead.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";

export const dynamic = "force-dynamic";

function yesNo(v: boolean | null | undefined): string {
  if (v === true) return "Yes";
  if (v === false) return "No";
  return "—";
}

function statusBadgeClasses(status: string | null | undefined): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-800";
    case "paused":
      return "bg-yellow-50 text-yellow-800";
    case "terminated":
      return "bg-red-50 text-red-800";
    default:
      return "bg-surface-100 text-ink-700";
  }
}

function billingBadgeClasses(model: string | null | undefined): string {
  return model === "wholesale"
    ? "bg-brand-50 text-brand-800"
    : "bg-surface-100 text-ink-700";
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
        {label}
      </p>
      <div className="mt-1 text-sm text-ink-900">{children}</div>
    </div>
  );
}

export default async function ResellerSettingsPage() {
  const user = await getCurrentUser();
  if (!user) return <p className="text-sm text-red-600">Not signed in.</p>;

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return <p className="text-sm text-yellow-800">No reseller membership.</p>;
    }
    throw err;
  }

  const db = resellerSupabase(scope);
  const r = await db.selfReseller();

  if (!r) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
        <p className="font-medium">Reseller not found</p>
        <p>Your reseller organisation could not be loaded.</p>
      </div>
    );
  }

  const allowedTiers: number[] = Array.isArray(r.allowed_tiers) ? r.allowed_tiers : [];
  const primaryColor: string | null = r.primary_color ?? null;

  return (
    <>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-ink-900">Reseller settings</h2>
        <p className="text-xs text-ink-500">
          Contact BlockID to edit — self-service is disabled to protect APP consent.
        </p>
      </div>

      <section className="mb-4 rounded-lg border border-surface-200 bg-white p-4">
        <h3 className="text-base font-semibold text-ink-900">Identity</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Code">
            <span className="font-mono text-brand-700">{r.code}</span>
          </Field>
          <Field label="Display name">{r.display_name ?? "—"}</Field>
          <Field label="Logo URL">
            {r.logo_url ? (
              <a
                href={r.logo_url}
                className="break-all text-brand-700 underline"
                target="_blank"
                rel="noreferrer"
              >
                {r.logo_url}
              </a>
            ) : (
              <span className="text-ink-500">—</span>
            )}
          </Field>
          <Field label="Primary color">
            {primaryColor ? (
              <span className="inline-flex items-center gap-2">
                <span
                  className="inline-block h-5 w-5 rounded border border-surface-200"
                  style={{ backgroundColor: primaryColor }}
                  aria-hidden="true"
                />
                <span className="font-mono text-xs text-ink-700">{primaryColor}</span>
              </span>
            ) : (
              <span className="text-ink-500">—</span>
            )}
          </Field>
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-surface-200 bg-white p-4">
        <h3 className="text-base font-semibold text-ink-900">Billing model</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Billing model">
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs ${billingBadgeClasses(r.billing_model)}`}
            >
              {r.billing_model ?? "—"}
            </span>
          </Field>
          <Field label="Commission share">
            {r.commission_share_pct != null ? `${r.commission_share_pct}%` : "—"}
          </Field>
          <Field label="GST registered">{yesNo(r.gst_registered)}</Field>
          <Field label="ABN">
            {r.abn ? (
              <span className="font-mono text-ink-900">{r.abn}</span>
            ) : (
              <span className="text-ink-500">—</span>
            )}
          </Field>
          <Field label="Status">
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs ${statusBadgeClasses(r.status)}`}
            >
              {r.status ?? "—"}
            </span>
          </Field>
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-surface-200 bg-white p-4">
        <h3 className="text-base font-semibold text-ink-900">Capabilities & budget</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Can create startups">
            {r.can_create_startups ? (
              <span className="text-emerald-700">✓ Yes</span>
            ) : (
              <span className="text-ink-500">No</span>
            )}
          </Field>
          <Field label="Can grant credits">
            {r.can_grant_credits ? (
              <span className="text-emerald-700">✓ Yes</span>
            ) : (
              <span className="text-ink-500">No</span>
            )}
          </Field>
          <Field label="Monthly credit budget">
            {(r.monthly_credit_budget ?? 0).toLocaleString()} credits
          </Field>
          <Field label="Monthly sandbox credits">
            {(r.monthly_sandbox_credits ?? 0).toLocaleString()} credits
          </Field>
          <Field label="Allowed tiers">
            {allowedTiers.length > 0 ? (
              <span className="font-mono text-ink-700">
                {allowedTiers.join(", ")}
              </span>
            ) : (
              <span className="text-ink-500">—</span>
            )}
          </Field>
        </div>
      </section>

      <p className="text-xs text-ink-500">
        Need a change? Email BlockID support — changes to billing model, allowed
        tiers or commission share affect APP consent and must be applied by an
        admin.
      </p>
    </>
  );
}
