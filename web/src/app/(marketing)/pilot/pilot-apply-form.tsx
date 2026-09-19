"use client";

// G16-C — /pilot application form. Client component posting JSON to
// /api/pilot/apply; no inline scripts (strict CSP), works with or without
// the marketing chrome. Mirrors the contact form: hidden honeypot
// (`company_website`), one status machine, no account required.

import * as React from "react";
import { CheckCircle2, Send } from "lucide-react";

const INPUT = "w-full h-11 rounded-xl border border-line bg-surface px-4 text-sm text-primary placeholder:text-tertiary focus:outline-none focus:border-action focus:ring-1 focus:ring-action transition-colors";
const LABEL = "block text-sm font-medium text-primary mb-1.5";

export function defaultIntakeMonth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function PilotApplyForm() {
  const [companyWebsite, setCompanyWebsite] = React.useState("");
  const [programName, setProgramName] = React.useState("");
  const [contactName, setContactName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [cohortSize, setCohortSize] = React.useState("");
  const [intakeMonth, setIntakeMonth] = React.useState(() => defaultIntakeMonth());
  const [message, setMessage] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "submitting") return;
    if (!programName.trim() || !contactName.trim() || !email.includes("@") || !cohortSize || !intakeMonth) {
      setErrorMsg("Please fill in every required field.");
      return;
    }
    setStatus("submitting");
    setErrorMsg("");
    try {
      const res = await fetch("/api/pilot/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_name: programName.trim(),
          contact_name: contactName.trim(),
          email: email.trim(),
          cohort_size: Number(cohortSize),
          intake_month: intakeMonth,
          message: message.trim(),
          company_website: companyWebsite,
        }),
      });
      if (res.status === 204) {
        // Honeypot path — behave exactly like success so a bot learns nothing.
        setStatus("success");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; issues?: Array<{ path: (string | number)[]; message: string }> };
      if (res.ok && data.ok) {
        setStatus("success");
        return;
      }
      setStatus("error");
      if (res.status === 429) setErrorMsg("Too many applications from this network — please try again in a few minutes.");
      else if (data.issues?.length) setErrorMsg(`Please check: ${data.issues.map((i) => `${String(i.path[0] ?? "")} — ${i.message}`).join("; ")}`);
      else setErrorMsg(data.message || data.error || "Something went wrong. Please try again.");
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div data-testid="pilot-apply-success" className="rounded-2xl border border-line bg-surface-sunken p-8 text-center">
        <CheckCircle2 strokeWidth={1.75} className="mx-auto mb-4 h-10 w-10 text-action" />
        <h3 className="mb-2 text-lg font-semibold text-primary">Application received</h3>
        <p className="text-sm text-secondary">We reply within two business days with a day-0 call proposal, the 7 success criteria to agree and your intake link. A confirmation is on its way to your inbox.</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" data-testid="pilot-apply-form" noValidate>
      {/* Honeypot: off-screen, tabindex -1, autocomplete off. Real users never see it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="pilot-company-website">Company website</label>
        <input id="pilot-company-website" name="company_website" type="text" tabIndex={-1} autoComplete="off" value={companyWebsite} onChange={(e) => setCompanyWebsite(e.target.value)} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label htmlFor="pilot-program" className={LABEL}>Program <span className="text-bear">*</span></label>
          <input id="pilot-program" name="program_name" type="text" required maxLength={120} value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="Accelerator, incubator, university program, angel group" className={INPUT} />
        </div>
        <div>
          <label htmlFor="pilot-contact" className={LABEL}>Contact name <span className="text-bear">*</span></label>
          <input id="pilot-contact" name="contact_name" type="text" required maxLength={120} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Your name" className={INPUT} />
        </div>
        <div>
          <label htmlFor="pilot-email" className={LABEL}>Work e-mail <span className="text-bear">*</span></label>
          <input id="pilot-email" name="email" type="email" required maxLength={320} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@program.org" className={INPUT} />
        </div>
        <div>
          <label htmlFor="pilot-cohort" className={LABEL}>Cohort size <span className="text-bear">*</span></label>
          <input id="pilot-cohort" name="cohort_size" type="number" inputMode="numeric" min={1} max={5000} required value={cohortSize} onChange={(e) => setCohortSize(e.target.value)} placeholder="Applicants in the next intake" className={INPUT} />
        </div>
        <div>
          <label htmlFor="pilot-month" className={LABEL}>Intake month <span className="text-bear">*</span></label>
          <input id="pilot-month" name="intake_month" type="month" required value={intakeMonth} onChange={(e) => setIntakeMonth(e.target.value)} className={INPUT} />
        </div>
      </div>
      <div>
        <label htmlFor="pilot-message" className={LABEL}>Anything else</label>
        <textarea id="pilot-message" name="message" rows={4} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Selection process today, sponsor / LP reporting needs, timing." className={`${INPUT} h-auto resize-none py-3`} />
      </div>
      {errorMsg ? <p role="alert" className="text-sm text-bear">{errorMsg}</p> : null}
      <button type="submit" disabled={status === "submitting"} className="inline-flex h-11 items-center gap-2 rounded-xl bg-action px-6 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 disabled:opacity-50">
        {status === "submitting" ? "Sending…" : (<>Apply for a pilot <Send strokeWidth={1.75} className="h-4 w-4" /></>)}
      </button>
      <p className="text-xs text-tertiary">No account needed to apply. The evaluator who runs the pilot signs up when the pilot starts — the comp is an admin grant, never a card on file.</p>
    </form>
  );
}
