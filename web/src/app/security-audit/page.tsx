/**
 * /security-audit — public audit summary surface.
 *
 * Server component. Content is a distilled write-up of the Phase 6 audit
 * sweep (v2.0.0-beta.5) and the Phase 8 deferred-finding closure
 * (v2.0.0-beta.6). Every claim maps back to a task/audit ID visible in
 * `web/CHANGELOG.md` so external reviewers can cross-check. No findings are
 * fabricated — items either link to a closed change or are listed under
 * "deferred" with the tracking ID.
 *
 * Opts into indexing because coordinated disclosure benefits from a stable,
 * discoverable landing surface.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Lock } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

const SITE_URL = "https://blockid.au";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Security audit — BlockID.au",
  description:
    "Methodology, closed findings, deferred TODOs, and coordinated-disclosure contact for the BlockID.au platform.",
  alternates: { canonical: `${SITE_URL}/security-audit` },
  robots: { index: true, follow: true },
};

function readCurrentVersion(): string | null {
  const candidates = [
    path.join(process.cwd(), "content", "reports", "version.json"),
    path.join(process.cwd(), "web", "content", "reports", "version.json"),
  ];
  for (const p of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(p, "utf8")) as { version?: unknown };
      if (typeof parsed.version === "string" && parsed.version.length > 0) {
        return parsed.version;
      }
    } catch {
      // try next
    }
  }
  return null;
}

type ClosedFinding = {
  id: string;
  severity: "High" | "Medium";
  title: string;
  detail: string;
  shipped_in: string;
};

const CLOSED_FINDINGS: ClosedFinding[] = [
  {
    id: "H1 sec",
    severity: "High",
    title: "Stripe cancel-flow save-offer coupon replay",
    detail:
      "The `api/stripe/cancel` endpoint now zod-strict-parses save_offer.coupon against an admin-issued allow-list (COMEBACK30, DOWNGRADE_STARTER50), enforces `.kind`, and requires `.href` to sit inside a same-origin allow-list. Prevents a signed-in user replaying admin-only retention coupons on their own subscription.",
    shipped_in: "v2.0.0-beta.5",
  },
  {
    id: "H2 sec",
    severity: "High",
    title: "Cron secret fail-open",
    detail:
      "`api/cron/lifecycle-mailer` and `api/cron/weekly-retention` now fail-closed when `CRON_SECRET` is missing. Previously the missing env var short-circuited to allow, which meant a mis-provisioned instance would accept unauthenticated cron POSTs.",
    shipped_in: "v2.0.0-beta.5",
  },
  {
    id: "H3 sec",
    severity: "High",
    title: "Disclaimer registry hash drift on repeat seed",
    detail:
      "Migration 0080 seed changed from `ON CONFLICT DO UPDATE` to `DO NOTHING`. The upsert path silently mutated `disclaimer_registry.hash` on repeat runs which would have broken the consent-chain integrity check.",
    shipped_in: "v2.0.0-beta.5",
  },
  {
    id: "M1",
    severity: "Medium",
    title: "Pause-collection replay",
    detail:
      "cancel-flow `pause_30d` path now rejects when a Stripe subscription already has `pause_collection` set, blocking a 29-day-loop billing deferral attack.",
    shipped_in: "v2.0.0-beta.5",
  },
  {
    id: "M4",
    severity: "Medium",
    title: "Unbounded jurisdiction query param",
    detail:
      "`api/legal/current-versions` now caps the `jurisdiction` query param length and matches it against `[A-Z]{2}|GLOBAL` before use.",
    shipped_in: "v2.0.0-beta.5",
  },
  {
    id: "H1 code + M6 code",
    severity: "High",
    title: "Lifecycle-mailer double-send + history-append race",
    detail:
      "Migration 0081 adds `pick_lifecycle_due()` with `FOR UPDATE SKIP LOCKED` (prevents two overlapping cron ticks from picking the same row) and `advance_lifecycle()` as an atomic UPDATE (closes the history-append race). `lib/conversion/lifecycle.ts` refactored to call the RPCs.",
    shipped_in: "v2.0.0-beta.6",
  },
  {
    id: "H4 sec",
    severity: "High",
    title: "CSP `unsafe-inline` + `unsafe-eval` on script-src",
    detail:
      "`web/src/proxy.ts` generates a fresh 128-bit nonce per request and builds a `script-src 'nonce-…' 'strict-dynamic'` CSP. `'unsafe-inline'` and `'unsafe-eval'` are removed from script-src. Root layout threads the nonce onto the GoogleAnalytics `<Script>` tags via `x-nonce`. Tailwind's `style-src 'unsafe-inline'` remains intentionally.",
    shipped_in: "v2.0.0-beta.6",
  },
];

type DeferredFinding = {
  id: string;
  title: string;
  planned_fix: string;
};

const DEFERRED_FINDINGS: DeferredFinding[] = [
  {
    id: "M8 code",
    title: "Permanent bounce classification",
    planned_fix:
      "Introduce a shared SES / SMTP status-parsing lib so lifecycle emails suppress permanent-failure recipients instead of retrying. Tracked in the Phase 6 audit deferred list.",
  },
];

export default function SecurityAuditPage() {
  const version = readCurrentVersion();

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Security audit summary"
        title="Security audit"
        subtitle="A public summary of the internal audit sweeps run against the BlockID.au platform. Every closed finding maps to a task ID visible in the changelog so external reviewers can verify."
      />

      {version ? (
        <p className="mx-auto max-w-5xl px-6 pb-4 text-xs text-[var(--fintech-ink-muted)]">
          Current shipped build:{" "}
          <span className="font-mono text-[var(--fintech-ink)]">{version}</span>
        </p>
      ) : null}

      <MarketingSection
        tone="elevated"
        title="Methodology"
        kicker="How the sweeps run"
      >
        <p className="text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
          Each milestone triggers a paired sweep — a security-audit pass
          focused on OWASP-adjacent regressions (auth, cron, headers,
          payment flows) and a code-review pass focused on correctness,
          race conditions, and data-integrity invariants. Findings are
          classified High / Medium / Low. Highs must ship before the
          milestone tag; Mediums are batched into the next release unless
          they touch a payment or consent surface.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
          Every claim on this page is anchored to a task ID visible in the
          public changelog (Phase 6 audit sweep in v2.0.0-beta.5; Phase 8
          deferred closure in v2.0.0-beta.6). Nothing here is inferred or
          invented — if a finding is not in the changelog it is not on this
          page.
        </p>
      </MarketingSection>

      <MarketingSection
        tone="elevated"
        title="Findings closed"
        kicker="Shipped"
      >
        <p className="text-sm text-[var(--fintech-ink-muted)]">
          The following findings shipped as fixes. Each row cites the
          release tag in which the fix landed.
        </p>
        <ul className="mt-6 space-y-4">
          {CLOSED_FINDINGS.map((f) => (
            <li
              key={f.id}
              className="rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-md bg-[var(--fintech-bg-primary)] px-2 py-0.5 font-mono text-[11px] text-[var(--fintech-accent)]">
                  {f.id}
                </span>
                <span
                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                    f.severity === "High"
                      ? "bg-rose-500/15 text-rose-200"
                      : "bg-amber-500/15 text-amber-200"
                  }`}
                >
                  {f.severity}
                </span>
                <span className="text-xs text-[var(--fintech-ink-muted)]">
                  Shipped in {f.shipped_in}
                </span>
              </div>
              <p className="mt-2 text-base font-semibold text-[var(--fintech-ink)]">
                {f.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
                {f.detail}
              </p>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection
        tone="elevated"
        title="Deferred TODOs"
        kicker="Tracked"
      >
        <p className="text-sm text-[var(--fintech-ink-muted)]">
          These findings are tracked but have not shipped yet. Each row
          cites the audit ID visible in the changelog under Phase 6
          deferred list.
        </p>
        <ul className="mt-6 space-y-4">
          {DEFERRED_FINDINGS.map((f) => (
            <li
              key={f.id}
              className="rounded-xl border border-[var(--fintech-border)] bg-[var(--fintech-surface)] p-5"
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center rounded-md bg-[var(--fintech-bg-primary)] px-2 py-0.5 font-mono text-[11px] text-[var(--fintech-accent)]">
                  {f.id}
                </span>
                <span className="inline-flex items-center rounded-md bg-[var(--fintech-bg-primary)] px-2 py-0.5 text-[11px] font-semibold text-[var(--fintech-ink-muted)]">
                  Deferred
                </span>
              </div>
              <p className="mt-2 text-base font-semibold text-[var(--fintech-ink)]">
                {f.title}
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
                {f.planned_fix}
              </p>
            </li>
          ))}
        </ul>
      </MarketingSection>

      <MarketingSection tone="elevated" title="Coordinated disclosure" kicker="Contact">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--fintech-surface)] text-[var(--fintech-accent)]">
            <Lock aria-hidden="true" className="h-4 w-4" />
          </span>
          <p className="text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
            If you have identified a security issue please email{" "}
            <a
              href="mailto:security@blockid.au"
              className="rounded-md text-[var(--fintech-accent)] underline decoration-[var(--fintech-accent)]/40 underline-offset-4 transition-colors duration-200 ease-out hover:decoration-[var(--fintech-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
            >
              security@blockid.au
            </a>
            . We will acknowledge receipt within one business day and aim
            to publish a fix or a mitigation plan within the next milestone
            tag. Do not open a public issue while a report is in flight —
            we credit reporters in the changelog once a fix has shipped.
          </p>
        </div>
      </MarketingSection>

      <MarketingCtaStrip
        headline="Read the full changelog."
        primary={{ href: "/changelog", label: "Changelog" }}
        secondary={{ href: "/status", label: "System status" }}
      />
    </MarketingShell>
  );
}
