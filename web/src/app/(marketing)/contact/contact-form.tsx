"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Send } from "lucide-react";

// Mirrors CONTACT_TOPICS in app/api/lead/route.ts — the API normalises
// anything else to "general".
const TOPICS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "general", label: "General question" },
  { value: "demo", label: "Book a demo" },
  { value: "sales", label: "Sales / plans" },
  { value: "support", label: "Support" },
  { value: "legal", label: "Legal / privacy" },
  { value: "partnership", label: "Partnership" },
  { value: "press", label: "Press" },
];

export function topicFromSearch(raw: string | null | undefined): string {
  const v = (raw ?? "").trim().toLowerCase();
  return TOPICS.some((t) => t.value === v) ? v : "general";
}

/** `?feature=` → a `[a-z0-9_-]{1,64}` slug or null (G20-F1 hidden-feature cards). */
export function featureFromSearch(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,64}$/.test(v) ? v : null;
}

export function ContactForm() {
  // QA-3 P1-9: `/contact?topic=demo|legal|…` pre-selects the topic; it is
  // sent with the lead so the support alert subject and /admin/leads carry it.
  const searchParams = useSearchParams();
  const [topic, setTopic] = React.useState(() => topicFromSearch(searchParams?.get("topic")));
  // G20-F1: `/contact?topic=sales&feature=<key>` from a hidden feature's
  // "Talk to us" card — the key rides on the lead payload so the founder
  // sees which not-offered surface was asked for. Anything but a slug is dropped.
  const feature = featureFromSearch(searchParams?.get("feature"));
  // Honeypot — hidden from humans (and screen readers); bots that fill every
  // field trip it and the API drops the submission silently.
  const [companyWebsite, setCompanyWebsite] = React.useState("");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [status, setStatus] = React.useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = React.useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes("@") || !message.trim()) {
      setErrorMsg("Please fill in all required fields.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "contact",
          email: email.trim(),
          company_website: companyWebsite,
          payload: { name: name.trim(), message: message.trim(), topic, ...(feature ? { feature } : {}) },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatus("success");
        setName("");
        setEmail("");
        setMessage("");
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="rounded-xl border border-line-subtle bg-accent-soft p-8 text-center shadow-1">
        <CheckCircle2
          strokeWidth={1.75}
          className="mx-auto h-10 w-10 text-action mb-4"
        />
        <h3 className="font-display text-lg font-bold text-primary mb-2">
          Message sent!
        </h3>
        <p className="text-sm text-secondary">
          Thanks for reaching out. We will get back to you within one business
          day.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-4 inline-flex min-h-11 items-center rounded-md text-sm text-action hover:underline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Honeypot: off-screen, tabindex -1, autocomplete off. Real users never see it. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
        <label htmlFor="contact-company-website">Company website</label>
        <input
          id="contact-company-website"
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={companyWebsite}
          onChange={(e) => setCompanyWebsite(e.target.value)}
        />
      </div>
      <div>
        <label
          htmlFor="contact-topic"
          className="block text-sm font-medium text-primary mb-1.5"
        >
          Topic
        </label>
        <select
          id="contact-topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className="w-full h-11 rounded-lg border border-line bg-surface px-4 text-sm text-primary placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors duration-(--dur-base)"
        >
          {TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label
          htmlFor="contact-name"
          className="block text-sm font-medium text-primary mb-1.5"
        >
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full h-11 rounded-lg border border-line bg-surface px-4 text-sm text-primary placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors duration-(--dur-base)"
        />
      </div>
      <div>
        <label
          htmlFor="contact-email"
          className="block text-sm font-medium text-primary mb-1.5"
        >
          Email <span className="text-bear">*</span>
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full h-11 rounded-lg border border-line bg-surface px-4 text-sm text-primary placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors duration-(--dur-base)"
        />
      </div>
      <div>
        <label
          htmlFor="contact-message"
          className="block text-sm font-medium text-primary mb-1.5"
        >
          Message <span className="text-bear">*</span>
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          required
          rows={5}
          className="w-full rounded-lg border border-line bg-surface px-4 text-sm text-primary placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors duration-(--dur-base) py-3 resize-none"
        />
      </div>
      {errorMsg && (
        <p className="text-sm text-bear" role="alert">{errorMsg}</p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-action px-5 text-sm font-semibold text-on-action hover:bg-action-hover transition-colors duration-(--dur-base) cursor-pointer disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        {status === "submitting" ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-on-action/30 border-t-on-action animate-spin" />
            Sending...
          </span>
        ) : (
          <>
            Send Message <Send strokeWidth={1.75} className="h-4 w-4" />
          </>
        )}
      </button>
    </form>
  );
}
