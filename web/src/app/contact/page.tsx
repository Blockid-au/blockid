"use client";

import * as React from "react";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import {
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Mail,
  MapPin,
  Send,
  Users,
} from "lucide-react";

function ContactForm() {
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
          payload: { name: name.trim(), message: message.trim() },
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
      <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
        <CheckCircle2
          strokeWidth={1.75}
          className="mx-auto h-10 w-10 text-green-600 mb-4"
        />
        <h3 className="text-lg font-bold text-green-800 mb-2">
          Message sent!
        </h3>
        <p className="text-sm text-green-700">
          Thanks for reaching out. We will get back to you within one business
          day.
        </p>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="mt-4 text-sm text-brand-600 hover:text-brand-500 underline cursor-pointer"
        >
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label
          htmlFor="contact-name"
          className="block text-sm font-medium text-ink-700 mb-1.5"
        >
          Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          className="w-full h-11 rounded-lg border border-surface-300 bg-white px-4 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors"
        />
      </div>
      <div>
        <label
          htmlFor="contact-email"
          className="block text-sm font-medium text-ink-700 mb-1.5"
        >
          Email <span className="text-red-500">*</span>
        </label>
        <input
          id="contact-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          required
          className="w-full h-11 rounded-lg border border-surface-300 bg-white px-4 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors"
        />
      </div>
      <div>
        <label
          htmlFor="contact-message"
          className="block text-sm font-medium text-ink-700 mb-1.5"
        >
          Message <span className="text-red-500">*</span>
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          required
          rows={5}
          className="w-full rounded-lg border border-surface-300 bg-white px-4 py-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-colors resize-none"
        />
      </div>
      {errorMsg && (
        <p className="text-sm text-red-500">{errorMsg}</p>
      )}
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-6 text-sm font-semibold text-white hover:bg-brand-500 transition-colors cursor-pointer disabled:opacity-50"
      >
        {status === "submitting" ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
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

export default function ContactPage() {
  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20">
        <div className="mx-auto max-w-4xl px-6">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-900">
              Contact Us
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-ink-600">
              Have a question, partnership enquiry, or need support? We would
              love to hear from you.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-10">
            {/* Left: Contact Form */}
            <div className="md:col-span-3">
              <ContactForm />
            </div>

            {/* Right: Info Cards */}
            <div className="md:col-span-2 space-y-5">
              {/* Email */}
              <div className="rounded-xl border border-surface-200 bg-surface-100 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                    <Mail strokeWidth={1.75} className="h-4.5 w-4.5" />
                  </span>
                  <h2 className="text-base font-semibold text-ink-800">
                    Email
                  </h2>
                </div>
                <a
                  href="mailto:admin@blockid.au"
                  className="text-sm text-brand-600 hover:text-brand-500 underline"
                >
                  admin@blockid.au
                </a>
                <p className="mt-1 text-xs text-ink-500">
                  We respond within one business day.
                </p>
              </div>

              {/* Location */}
              <div className="rounded-xl border border-surface-200 bg-surface-100 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                    <MapPin strokeWidth={1.75} className="h-4.5 w-4.5" />
                  </span>
                  <h2 className="text-base font-semibold text-ink-800">
                    Location
                  </h2>
                </div>
                <p className="text-sm text-ink-700">Sydney, NSW, Australia</p>
                <p className="mt-1 text-xs text-ink-500">
                  Auschain Pty Ltd (ABN 79 659 615 111)
                </p>
              </div>

              {/* Social */}
              <div className="rounded-xl border border-surface-200 bg-surface-100 p-5">
                <h2 className="text-base font-semibold text-ink-800 mb-3">
                  Follow Us
                </h2>
                <div className="flex flex-col gap-2.5">
                  <a
                    href="https://linkedin.com/company/blockid-au"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-ink-600 hover:text-brand-600 transition-colors"
                  >
                    <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" />
                    LinkedIn
                  </a>
                  <a
                    href="https://twitter.com/blockid_au"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-ink-600 hover:text-brand-600 transition-colors"
                  >
                    <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" />
                    Twitter / X
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Audience-specific links */}
          <div className="mt-14 grid sm:grid-cols-2 gap-5">
            <Link
              href="/investors"
              className="group flex items-start gap-4 rounded-xl border border-surface-200 bg-surface-50 p-5 hover:border-brand-200 hover:bg-brand-50/30 transition-colors"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                <Users strokeWidth={1.75} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-800 group-hover:text-brand-700 transition-colors">
                  For Investors
                </p>
                <p className="text-xs text-ink-500 mt-1">
                  Explore how BlockID supports deal flow, portfolio visibility,
                  and due diligence.
                </p>
                <span className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium mt-2">
                  Learn more{" "}
                  <ArrowRight strokeWidth={1.75} className="h-3 w-3" />
                </span>
              </div>
            </Link>
            <Link
              href="/admin/accelerator"
              className="group flex items-start gap-4 rounded-xl border border-surface-200 bg-surface-50 p-5 hover:border-brand-200 hover:bg-brand-50/30 transition-colors"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink-800 group-hover:text-brand-700 transition-colors">
                  For Accelerators
                </p>
                <p className="text-xs text-ink-500 mt-1">
                  Discover how BlockID powers accelerator cohorts with SVI
                  tracking and portfolio dashboards.
                </p>
                <span className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium mt-2">
                  Learn more{" "}
                  <ArrowRight strokeWidth={1.75} className="h-3 w-3" />
                </span>
              </div>
            </Link>
          </div>

          {/* Support note */}
          <section className="mt-12">
            <h2 className="text-xl font-semibold text-ink-800 mb-3">
              Support
            </h2>
            <p className="text-sm leading-relaxed text-ink-600">
              For technical support or account-related queries, email us at{" "}
              <a
                href="mailto:admin@blockid.au"
                className="text-brand-600 hover:text-brand-500 underline"
              >
                admin@blockid.au
              </a>{" "}
              with a description of your issue. If you are a Founding 50
              member, please include your account email so we can prioritise
              your request.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
