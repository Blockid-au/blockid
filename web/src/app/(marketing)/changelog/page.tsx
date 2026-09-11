import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo/page-meta";
import fs from "node:fs";
import path from "node:path";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({
  title: "Changelog",
  description: "Every BlockID.au release, fix and ship in order — version, date and what changed for founders and evaluators. No marketing spin.",
  path: "/changelog",
});

// ---------------------------------------------------------------------------
// File loader
// ---------------------------------------------------------------------------

function readChangelog(): string | null {
  const candidates = [
    path.join(process.cwd(), "CHANGELOG.md"),
    path.join(process.cwd(), "..", "CHANGELOG.md"),
    path.join(process.cwd(), "web", "CHANGELOG.md"),
  ];
  for (const p of candidates) {
    try {
      return fs.readFileSync(p, "utf-8");
    } catch {
      // try next
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Minimal markdown -> HTML string renderer.
// ---------------------------------------------------------------------------

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(input: string): string {
  let s = escapeHtml(input);
  s = s.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-surface-raised px-1.5 py-0.5 text-[0.85em] text-action">$1</code>',
  );
  s = s.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-primary">$1</strong>',
  );
  return s;
}

type ReleaseAnchor = { id: string; label: string };

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s.-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function renderMarkdown(md: string): {
  html: string;
  releases: ReleaseAnchor[];
} {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  const releases: ReleaseAnchor[] = [];
  // Block 5 rev.3 (2026-09-08): CHANGELOG.md contains repeated release
  // headings (e.g. two "v3.5.0 — Code & Website" entries a week apart).
  // Slugify would emit identical `id="…"` attributes which pa11y flags as
  // WCAG 2.1 4.1.1. Track a per-slug counter and append `-2`, `-3`, … so
  // every anchor is unique while the first occurrence keeps its clean id.
  const slugCounts = new Map<string, number>();

  let i = 0;
  let inList = false;
  let paraBuf: string[] = [];

  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  const flushPara = () => {
    if (paraBuf.length > 0) {
      out.push(
        `<p class="mt-3 leading-relaxed text-secondary">${renderInline(
          paraBuf.join(" "),
        )}</p>`,
      );
      paraBuf = [];
    }
  };

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (trimmed === "") {
      flushPara();
      flushList();
      i++;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushPara();
      flushList();
      const text = trimmed.slice(4);
      out.push(
        `<h3 class="mt-8 text-lg font-semibold tracking-tight text-primary">${renderInline(
          text,
        )}</h3>`,
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushPara();
      flushList();
      const text = trimmed.slice(3);
      const base = slugify(text);
      const seen = slugCounts.get(base) ?? 0;
      slugCounts.set(base, seen + 1);
      const id = seen === 0 ? base : `${base}-${seen + 1}`;
      releases.push({ id, label: text });
      out.push(
        `<h2 id="${id}" class="mt-14 border-t border-line-subtle pt-10 text-2xl font-bold tracking-tight text-primary sm:text-3xl">${renderInline(
          text,
        )}</h2>`,
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushPara();
      flushList();
      i++;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      flushPara();
      if (!inList) {
        out.push(
          '<ul class="mt-4 space-y-2 list-disc pl-6 text-secondary marker:text-action">',
        );
        inList = true;
      }
      const text = trimmed.slice(2);
      out.push(
        `<li class="leading-relaxed">${renderInline(text)}</li>`,
      );
      i++;
      continue;
    }

    flushList();
    paraBuf.push(trimmed);
    i++;
  }

  flushPara();
  flushList();

  return { html: out.join("\n"), releases };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ChangelogPage() {
  const raw = readChangelog();
  const parsed = raw
    ? renderMarkdown(raw)
    : { html: "", releases: [] as ReleaseAnchor[] };

  return (
    <MarketingShell>
      <PageViewTracker event="changelog_viewed" params={{}} />

      <MarketingHero
        eyebrow="Changelog"
        title="Every release, every fix"
        subtitle="Auto-generated from git and task IDs. Newest release first."
      />

      <section
        aria-label="Changelog content"
        className="mx-auto max-w-5xl px-6 py-12 sm:py-16"
      >
        <div className="grid gap-10 lg:grid-cols-[1fr_240px]">
          {/* Content */}
          <article className="min-w-0 rounded-3xl border border-line-subtle bg-surface-sunken p-8 sm:p-10">
            {raw ? (
              <div
                className="text-sm sm:text-base"
                dangerouslySetInnerHTML={{ __html: parsed.html }}
              />
            ) : (
              <p className="text-sm text-secondary">
                Changelog not yet published for this environment. The next
                deploy will populate this page.
              </p>
            )}
          </article>

          {/* Sidebar (desktop only) */}
          <aside aria-label="Jump to release" className="hidden lg:block">
            <div className="sticky top-24 rounded-2xl border border-line-subtle bg-surface-sunken p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-action">
                Releases
              </p>
              {parsed.releases.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {parsed.releases.map((r) => (
                    <li key={r.id}>
                      <a
                        href={`#${r.id}`}
                        className="block truncate rounded-md px-2 py-1 text-xs text-secondary transition-colors duration-200 ease-out hover:bg-surface-raised hover:text-action focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      >
                        {r.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-xs text-secondary">
                  No releases indexed yet.
                </p>
              )}
            </div>
          </aside>
        </div>
      </section>

      <MarketingCtaStrip
        headline="See what's next."
        primary={{ href: "/roadmap", label: "Roadmap" }}
        secondary={{ href: "/security-audit", label: "Security audit" }}
      />
    </MarketingShell>
  );
}
