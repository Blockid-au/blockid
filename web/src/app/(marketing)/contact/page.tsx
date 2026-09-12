"use client";

import * as React from "react";
import Link from "next/link";
import { NavV2 } from "@/components/landing/nav-v2";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
// QA-3 P1-9 (2026-09-12): one contact form (honeypot + ?topic= + support
// alert wiring) — the inline duplicate that lived here was removed.
import { ContactForm } from "./contact-form";
import {
  ArrowRight,
  ExternalLink,
  Mail,
  MapPin,
  Users,
} from "lucide-react";

export default function ContactPage() {
  return (
    <div style={{ backgroundColor: "#0A0F1E" }} className="min-h-screen text-[#F8FAFC]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-[#00D4FF] focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-[#0A0F1E]"
      >
        Skip to content
      </a>
      <NavV2 />
      <main id="main-content" className="pt-28 pb-20">
        <div className="mx-auto max-w-4xl px-6">
          {/* Header */}
          <div className="mb-12">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#00D4FF] mb-3">
              Get in touch
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-[#F8FAFC]">
              Contact Us
            </h1>
            <p className="mt-4 text-lg leading-relaxed text-[#94A3B8]">
              Have a question, partnership enquiry, or need support? We would
              love to hear from you.
            </p>
          </div>

          <div className="grid md:grid-cols-5 gap-10">
            {/* Left: Contact Form */}
            <div className="md:col-span-3">
              {/* useSearchParams() needs a Suspense boundary on the App Router */}
              <React.Suspense fallback={null}>
                <ContactForm />
              </React.Suspense>
            </div>

            {/* Right: Info Cards */}
            <div className="md:col-span-2 space-y-5">
              {/* Email */}
              <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(0,212,255,0.15)] text-[#00D4FF]">
                    <Mail strokeWidth={1.75} className="h-4 w-4" />
                  </span>
                  <h2 className="text-base font-semibold text-[#F8FAFC]">
                    Email
                  </h2>
                </div>
                <a
                  href="mailto:admin@blockid.au"
                  className="text-sm text-[#00D4FF] hover:underline"
                >
                  admin@blockid.au
                </a>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  We respond within one business day.
                </p>
              </div>

              {/* Location */}
              <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[rgba(0,212,255,0.15)] text-[#00D4FF]">
                    <MapPin strokeWidth={1.75} className="h-4 w-4" />
                  </span>
                  <h2 className="text-base font-semibold text-[#F8FAFC]">
                    Location
                  </h2>
                </div>
                <p className="text-sm text-[#F8FAFC]">Sydney, NSW, Australia</p>
                <p className="mt-1 text-xs text-[#94A3B8]">
                  Auschain Pty Ltd (ABN 79 659 615 111)
                </p>
              </div>

              {/* Social */}
              <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm p-5">
                <h2 className="text-base font-semibold text-[#F8FAFC] mb-3">
                  Follow Us
                </h2>
                <div className="flex flex-col gap-2.5">
                  <a
                    href="https://linkedin.com/company/blockid-au"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-[#94A3B8] hover:text-[#00D4FF] transition-colors"
                  >
                    <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" />
                    LinkedIn
                  </a>
                  {/* No X / Twitter link: @blockid_au does not exist (404 on
                      twitter.com and x.com — release QA-1 #14). LinkedIn is
                      the one live company profile (config/marketing-partners
                      + footer agree). Re-add only with a verified handle. */}
                </div>
              </div>
            </div>
          </div>

          {/* Audience-specific links */}
          <div className="mt-14 grid sm:grid-cols-2 gap-5">
            <Link
              href="/solutions/investor"
              className="group flex items-start gap-4 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm p-5 transition-all duration-300 hover:border-[rgba(0,212,255,0.3)] hover:scale-[1.02]"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(0,212,255,0.15)] text-[#00D4FF]">
                <Users strokeWidth={1.75} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#F8FAFC] group-hover:text-[#00D4FF] transition-colors">
                  For Investors
                </p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Explore how BlockID supports deal flow, portfolio visibility,
                  and due diligence.
                </p>
                <span className="inline-flex items-center gap-1 text-xs text-[#00D4FF] font-medium mt-2">
                  Learn more{" "}
                  <ArrowRight strokeWidth={1.75} className="h-3 w-3" />
                </span>
              </div>
            </Link>
            <Link
              href="/solutions/accelerator"
              className="group flex items-start gap-4 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.04)] backdrop-blur-sm p-5 transition-all duration-300 hover:border-[rgba(0,212,255,0.3)] hover:scale-[1.02]"
            >
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgba(0,212,255,0.15)] text-[#00D4FF]">
                <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[#F8FAFC] group-hover:text-[#00D4FF] transition-colors">
                  For Accelerators
                </p>
                <p className="text-xs text-[#94A3B8] mt-1">
                  Discover how BlockID powers accelerator cohorts with SVI
                  tracking and portfolio dashboards.
                </p>
                <span className="inline-flex items-center gap-1 text-xs text-[#00D4FF] font-medium mt-2">
                  Learn more{" "}
                  <ArrowRight strokeWidth={1.75} className="h-3 w-3" />
                </span>
              </div>
            </Link>
          </div>

          {/* Support note */}
          <section className="mt-12">
            <h2 className="text-xl font-semibold text-[#F8FAFC] mb-3">
              Support
            </h2>
            <p className="text-sm leading-relaxed text-[#94A3B8]">
              For technical support or account-related queries, email us at{" "}
              <a
                href="mailto:admin@blockid.au"
                className="text-[#00D4FF] hover:underline"
              >
                admin@blockid.au
              </a>{" "}
              with a description of your issue. If you are a Founding 100
              member, please include your account email so we can prioritise
              your request.
            </p>
          </section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
