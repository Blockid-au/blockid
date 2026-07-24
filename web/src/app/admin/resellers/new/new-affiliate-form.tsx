"use client";

import { useMemo, useState } from "react";

interface ResellerOption {
  code: string;
  display_name: string;
}

interface Props {
  resellers: ResellerOption[];
}

type InviteMethod = "temp_password" | "set_password" | "magic_link";
type ResellerMode = "create" | "attach";

interface ProvisionResponse {
  ok: boolean;
  idempotent?: boolean;
  reason?: string;
  hint?: string;
  error?: string;
  issues?: Array<{ path: string; message: string }>;
  user?: {
    id: string;
    email: string;
    display_name: string;
    plan: string;
    account_type: string;
  };
  reseller?: {
    id: string;
    code: string;
    display_name: string;
    billing_model: string;
    created: boolean;
  };
  membership?: {
    role: string;
    status: string;
    created: boolean;
  };
  seed_credits?: number | null;
  tier0_code?: { code: string; id: string } | null;
  invite?:
    | { method: "temp_password"; temp_password: string }
    | { method: "set_password" }
    | {
        method: "magic_link";
        magic_link_url: string | null;
        token: string | null;
        expires_at: string | null;
      };
}

const label = "block text-xs font-medium uppercase tracking-wide text-ink-500";
const input =
  "mt-1 w-full rounded-md border border-surface-300 bg-white px-2 py-1.5 text-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600";
const helpText = "mt-1 text-xs text-ink-500";
const card =
  "rounded-lg border border-surface-200 bg-white p-4";

export function NewAffiliateForm({ resellers }: Props) {
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [accountType, setAccountType] = useState<"reseller" | "affiliate">("reseller");
  const [role, setRole] = useState<"owner" | "admin" | "viewer">("owner");

  const [resellerMode, setResellerMode] = useState<ResellerMode>("create");
  const [attachCode, setAttachCode] = useState<string>(resellers[0]?.code ?? "");

  const [createCode, setCreateCode] = useState("");
  const [createDisplayName, setCreateDisplayName] = useState("");
  const [billingModel, setBillingModel] = useState<"retail" | "wholesale">("retail");
  const [abn, setAbn] = useState("");
  const [gstRegistered, setGstRegistered] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState<number>(0);
  const [monthlySandbox, setMonthlySandbox] = useState<number>(500);
  const [commissionSharePct, setCommissionSharePct] = useState<number>(40);
  const [canCreateStartups, setCanCreateStartups] = useState(false);
  const [canGrantCredits, setCanGrantCredits] = useState(false);
  const [contactEmail, setContactEmail] = useState("");

  const [inviteMethod, setInviteMethod] = useState<InviteMethod>("temp_password");
  const [initialPassword, setInitialPassword] = useState("");

  const [seedCredits, setSeedCredits] = useState<number>(0);
  const [tier0Code, setTier0Code] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ProvisionResponse | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const wholesale = resellerMode === "create" && billingModel === "wholesale";

  const resellerBody = useMemo(() => {
    if (resellerMode === "attach") return { mode: "attach" as const, code: attachCode };
    return {
      mode: "create" as const,
      code: createCode,
      display_name: createDisplayName,
      billing_model: billingModel,
      abn: abn || undefined,
      gst_registered: gstRegistered,
      monthly_credit_budget: monthlyBudget,
      monthly_sandbox_credits: monthlySandbox,
      commission_share_pct: commissionSharePct,
      can_create_startups: canCreateStartups,
      can_grant_credits: canGrantCredits,
      contact_email: contactEmail || undefined,
    };
  }, [
    resellerMode,
    attachCode,
    createCode,
    createDisplayName,
    billingModel,
    abn,
    gstRegistered,
    monthlyBudget,
    monthlySandbox,
    commissionSharePct,
    canCreateStartups,
    canGrantCredits,
    contactEmail,
  ]);

  function resetForm() {
    setEmail("");
    setDisplayName("");
    setAccountType("reseller");
    setRole("owner");
    setResellerMode("create");
    setCreateCode("");
    setCreateDisplayName("");
    setBillingModel("retail");
    setAbn("");
    setGstRegistered(false);
    setMonthlyBudget(0);
    setMonthlySandbox(500);
    setCommissionSharePct(40);
    setCanCreateStartups(false);
    setCanGrantCredits(false);
    setContactEmail("");
    setInviteMethod("temp_password");
    setInitialPassword("");
    setSeedCredits(0);
    setTier0Code("");
    setResult(null);
    setErrorText(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setResult(null);
    setErrorText(null);

    const invite: Record<string, unknown> =
      inviteMethod === "set_password"
        ? { method: "set_password", password: initialPassword }
        : { method: inviteMethod };

    const payload: Record<string, unknown> = {
      email,
      display_name: displayName,
      account_type: accountType,
      role,
      reseller: resellerBody,
      invite,
    };
    if (seedCredits > 0) payload.seed_credits = seedCredits;
    if (tier0Code.trim()) payload.mint_tier0_code = { code: tier0Code.trim() };

    try {
      const resp = await fetch("/api/admin/affiliate/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await resp.json()) as ProvisionResponse;
      if (!resp.ok || !body.ok) {
        const reason = body.reason ?? body.error ?? `HTTP ${resp.status}`;
        const issues = body.issues?.length
          ? " — " + body.issues.map((i) => `${i.path}: ${i.message}`).join("; ")
          : "";
        setErrorText(`${reason}${body.hint ? ` (${body.hint})` : ""}${issues}`);
      } else {
        setResult(body);
      }
    } catch (err) {
      setErrorText((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {result && result.ok ? (
        <SuccessCard result={result} onReset={resetForm} />
      ) : null}
      {errorText ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Provisioning failed</p>
          <p className="mt-1 font-mono text-xs">{errorText}</p>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="space-y-5">
        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Account</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={label}>Email</label>
              <input
                className={input}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="founder@example.com"
              />
            </div>
            <div>
              <label className={label}>Display name</label>
              <input
                className={input}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                minLength={2}
                required
              />
            </div>
            <div>
              <label className={label}>Account type</label>
              <select
                className={input}
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as "reseller" | "affiliate")}
              >
                <option value="reseller">reseller</option>
                <option value="affiliate">affiliate</option>
              </select>
              <p className={helpText}>
                Writes to <code>app_users.account_type</code>. Plan is always{" "}
                <code>reseller_admin</code>.
              </p>
            </div>
            <div>
              <label className={label}>Membership role</label>
              <select
                className={input}
                value={role}
                onChange={(e) => setRole(e.target.value as "owner" | "admin" | "viewer")}
              >
                <option value="owner">owner</option>
                <option value="admin">admin</option>
                <option value="viewer">viewer</option>
              </select>
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Reseller org</h2>
          <div className="mb-3 inline-flex rounded-md border border-surface-300 bg-surface-50 p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setResellerMode("create")}
              className={`rounded px-3 py-1 ${resellerMode === "create" ? "bg-white shadow-sm" : "text-ink-600"}`}
            >
              Create new
            </button>
            <button
              type="button"
              onClick={() => setResellerMode("attach")}
              className={`rounded px-3 py-1 ${resellerMode === "attach" ? "bg-white shadow-sm" : "text-ink-600"}`}
            >
              Attach existing
            </button>
          </div>

          {resellerMode === "attach" ? (
            <div>
              <label className={label}>Existing reseller</label>
              <select
                className={input}
                value={attachCode}
                onChange={(e) => setAttachCode(e.target.value)}
                required
              >
                {resellers.length === 0 && <option value="">(no active resellers)</option>}
                {resellers.map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.display_name} — {r.code}
                  </option>
                ))}
              </select>
              <p className={helpText}>
                Links the new user into an existing reseller_admins row. Their
                membership role above still applies.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className={label}>Code</label>
                <input
                  className={`${input} font-mono uppercase`}
                  value={createCode}
                  onChange={(e) => setCreateCode(e.target.value.toUpperCase())}
                  required
                />
                <p className={helpText}>Uppercase, letters + digits only.</p>
              </div>
              <div>
                <label className={label}>Display name</label>
                <input
                  className={input}
                  value={createDisplayName}
                  onChange={(e) => setCreateDisplayName(e.target.value)}
                  minLength={2}
                  required
                />
              </div>
              <div>
                <label className={label}>Billing model</label>
                <select
                  className={input}
                  value={billingModel}
                  onChange={(e) => setBillingModel(e.target.value as "retail" | "wholesale")}
                >
                  <option value="retail">retail</option>
                  <option value="wholesale">wholesale</option>
                </select>
              </div>
              <div>
                <label className={label}>Contact email</label>
                <input
                  className={input}
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                />
              </div>
              <div>
                <label className={label}>
                  ABN {wholesale ? <span className="text-red-600">*</span> : null}
                </label>
                <input
                  className={`${input} font-mono`}
                  value={abn}
                  onChange={(e) => setAbn(e.target.value)}
                  placeholder="NN NNN NNN NNN"
                  required={wholesale}
                />
                <p className={helpText}>Format: NN NNN NNN NNN (with spaces).</p>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  id="gst"
                  type="checkbox"
                  checked={gstRegistered}
                  onChange={(e) => setGstRegistered(e.target.checked)}
                />
                <label htmlFor="gst" className="text-sm">
                  GST registered {wholesale ? <span className="text-red-600">*</span> : null}
                </label>
              </div>
              <div>
                <label className={label}>Monthly credit budget</label>
                <input
                  className={input}
                  type="number"
                  min={0}
                  value={monthlyBudget}
                  onChange={(e) => setMonthlyBudget(Number(e.target.value))}
                />
              </div>
              <div>
                <label className={label}>Monthly sandbox credits</label>
                <input
                  className={input}
                  type="number"
                  min={0}
                  value={monthlySandbox}
                  onChange={(e) => setMonthlySandbox(Number(e.target.value))}
                />
              </div>
              <div>
                <label className={label}>Commission share %</label>
                <input
                  className={input}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={commissionSharePct}
                  onChange={(e) => setCommissionSharePct(Number(e.target.value))}
                />
              </div>
              <div className="flex flex-col justify-center gap-2 pt-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={canCreateStartups}
                    onChange={(e) => setCanCreateStartups(e.target.checked)}
                  />
                  can_create_startups (wholesale)
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={canGrantCredits}
                    onChange={(e) => setCanGrantCredits(e.target.checked)}
                  />
                  can_grant_credits
                </label>
              </div>
            </div>
          )}
          {wholesale ? (
            <p className="mt-3 rounded-md bg-yellow-50 p-2 text-xs text-yellow-800">
              Wholesale billing model requires BOTH gst_registered=true AND a
              well-formed ABN — enforced by <code>ck_wholesale_gst_required</code>.
            </p>
          ) : null}
        </section>

        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Invite method</h2>
          <div className="flex flex-wrap gap-2 text-sm">
            {(["temp_password", "set_password", "magic_link"] as InviteMethod[]).map((m) => (
              <label
                key={m}
                className={`cursor-pointer rounded-md border px-3 py-1.5 ${
                  inviteMethod === m
                    ? "border-brand-600 bg-brand-50 text-brand-800"
                    : "border-surface-300"
                }`}
              >
                <input
                  type="radio"
                  className="mr-2"
                  checked={inviteMethod === m}
                  onChange={() => setInviteMethod(m)}
                />
                {m}
              </label>
            ))}
          </div>
          {inviteMethod === "set_password" ? (
            <div className="mt-3">
              <label className={label}>Initial password (min 8 chars)</label>
              <input
                className={input}
                type="text"
                value={initialPassword}
                minLength={8}
                onChange={(e) => setInitialPassword(e.target.value)}
                required
              />
              <p className={helpText}>
                Shared with the user out-of-band. Bcrypt-hashed server-side.
              </p>
            </div>
          ) : null}
          {inviteMethod === "temp_password" ? (
            <p className={helpText}>
              A strong 10-char temp password is generated and returned ONCE in
              the success card.
            </p>
          ) : null}
          {inviteMethod === "magic_link" ? (
            <p className={helpText}>
              Returns a 24h magic-link URL you can hand off. No password is
              changed on the account.
            </p>
          ) : null}
        </section>

        <section className={card}>
          <h2 className="mb-3 text-sm font-semibold text-ink-900">Optional</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className={label}>Seed credits</label>
              <input
                className={input}
                type="number"
                min={0}
                value={seedCredits}
                onChange={(e) => setSeedCredits(Number(e.target.value))}
              />
              <p className={helpText}>
                Requires the reseller to have <code>can_grant_credits</code>.
                Writes to credit_balances + credit_transactions +
                reseller_credit_grants.
              </p>
            </div>
            <div>
              <label className={label}>Mint tier-0 promotion code</label>
              <input
                className={`${input} font-mono uppercase`}
                value={tier0Code}
                onChange={(e) => setTier0Code(e.target.value.toUpperCase())}
                placeholder="e.g. INFOVISION"
              />
              <p className={helpText}>
                Tier 0 (0% off, no Stripe coupon). Tier {`>`} 0 codes go
                through the requests approval flow.
              </p>
            </div>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <a
            href="/admin/resellers"
            className="rounded-md border border-surface-300 bg-white px-3 py-1.5 text-sm text-ink-700"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {submitting ? "Provisioning…" : "Provision"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SuccessCard({
  result,
  onReset,
}: {
  result: ProvisionResponse;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked — no-op */
    }
  }

  const invite = result.invite;
  const idempotent = result.idempotent;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
      <p className="text-sm font-medium text-emerald-900">
        {idempotent ? "Account already provisioned — no changes made." : "Account provisioned."}
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-y-1 text-xs text-ink-800 md:grid-cols-2">
        <div>
          <dt className="font-medium">User</dt>
          <dd>
            {result.user?.email} ({result.user?.plan} · {result.user?.account_type})
          </dd>
        </div>
        <div>
          <dt className="font-medium">Reseller</dt>
          <dd>
            {result.reseller?.display_name} —{" "}
            <span className="font-mono">{result.reseller?.code}</span> (
            {result.reseller?.billing_model})
          </dd>
        </div>
        <div>
          <dt className="font-medium">Membership</dt>
          <dd>
            {result.membership?.role} · {result.membership?.status}
          </dd>
        </div>
        <div>
          <dt className="font-medium">Seed credits</dt>
          <dd>{result.seed_credits ?? "—"}</dd>
        </div>
        {result.tier0_code ? (
          <div className="md:col-span-2">
            <dt className="font-medium">Tier-0 promotion code</dt>
            <dd className="font-mono">{result.tier0_code.code}</dd>
          </div>
        ) : null}
      </dl>

      {invite?.method === "temp_password" ? (
        <div className="mt-3 rounded-md border border-yellow-300 bg-yellow-50 p-3">
          <p className="text-xs font-semibold text-yellow-900">
            Temporary password — shown ONCE. Share securely (Signal/1Password), never email in plain-text.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 rounded bg-white px-2 py-1 font-mono text-sm text-ink-900">
              {invite.temp_password}
            </code>
            <button
              type="button"
              onClick={() => copy(invite.temp_password, "password")}
              className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white"
            >
              {copied === "password" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      {invite?.method === "magic_link" && invite.magic_link_url ? (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-semibold text-blue-900">
            Magic-link URL (24h TTL)
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1 font-mono text-xs text-ink-900">
              {invite.magic_link_url}
            </code>
            <button
              type="button"
              onClick={() => copy(invite.magic_link_url!, "link")}
              className="rounded-md bg-brand-600 px-2 py-1 text-xs font-medium text-white"
            >
              {copied === "link" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      {invite?.method === "magic_link" && !invite.magic_link_url ? (
        <p className="mt-3 text-xs text-red-700">
          Magic-link mint failed — retry via /admin/users or the password
          reset flow.
        </p>
      ) : null}

      {invite?.method === "set_password" ? (
        <p className="mt-3 text-xs text-ink-700">
          Initial password was bcrypt-hashed server-side. Share the plaintext
          separately if you haven't already.
        </p>
      ) : null}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onReset}
          className="rounded-md border border-surface-300 bg-white px-3 py-1.5 text-sm"
        >
          Provision another
        </button>
        {result.reseller?.code ? (
          <a
            href={`/admin/resellers/${result.reseller.code.toLowerCase()}`}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Open reseller detail
          </a>
        ) : null}
      </div>
    </div>
  );
}
