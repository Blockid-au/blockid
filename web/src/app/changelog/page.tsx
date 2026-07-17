import type { Metadata } from "next";
import Link from "next/link";
import fs from "node:fs";
import path from "node:path";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageViewTracker } from "@/components/site/page-view-tracker";
import { ArrowRight, ScrollText } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Changelog — BlockID.au",
  description:
    "Every release, every fix, every ship — no marketing spin.",
  robots: { index: true, follow: true },
  alternates: { canonical: "https://blockid.au/changelog" },
};

// ---------------------------------------------------------------------------
// File loader — CHANGELOG.md may live at web/ root (cwd when `next start`
// is run from web/) or at the repo root when cwd is one level up.
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
//
// Supported:
//   - `# Heading` / `## Heading` / `### Heading`
//   - `- item` bullet lists (contiguous)
//   - `**bold**` inline
//   - `` `code` `` inline
//   - blank-line-separated paragraphs
//
// Deliberately narrow: `web/CHANGELOG.md` follows this shape and we don't want
// to pull `marked` (not in deps) or invent a full parser.
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
  // inline code first so ** inside code isn't parsed
  s = s.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-brand-navy-deep/60 px-1.5 py-0.5 text-[0.85em] text-brand-cyan">$1</code>',
  );
  s = s.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-brand-ink">$1</strong>',
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
        `<p class="mt-3 leading-relaxed text-brand-ink-muted">${renderInline(
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
        `<h3 class="mt-8 text-lg font-semibold tracking-tight text-brand-ink">${renderInline(
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
      const id = slugify(text);
      releases.push({ id, label: text });
      out.push(
        `<h2 id="${id}" class="mt-14 border-t border-brand-cyan/15 pt-10 text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">${renderInline(
          text,
        )}</h2>`,
      );
      i++;
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushPara();
      flushList();
      // top-level heading is rendered by the page hero already; skip
      i++;
      continue;
    }

    if (trimmed.startsWith("- ")) {
      flushPara();
      if (!inList) {
        out.push(
          '<ul class="mt-4 space-y-2 list-disc pl-6 text-brand-ink-muted marker:text-brand-cyan/70">',
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
    <div data-theme="lux" className="min-h-svh bg-brand-navy-deep text-brand-ink">
      <PageViewTracker event="changelog_viewed" params={{}} />
      <Navbar />

      <main className="mx-auto max-w-7xl px-6 pt-24 pb-24">
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
            <ScrollText aria-hidden="true" className="h-3.5 w-3.5" />
            Changelog
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-brand-ink sm:text-5xl">
            <span className="lux-heading">Changelog</span>
          </h1>
          <p className="mt-4 text-lg text-brand-ink-muted">
            Auto-generated from git and task IDs. Newest release first.
          </p>
        </div>

        <div className="mt-16 grid gap-10 lg:grid-cols-[1fr_240px]">
          {/* Content */}
          <article className="min-w-0 rounded-3xl border border-brand-cyan/15 bg-brand-navy-elev-1 p-8 sm:p-10">
            {raw ? (
              <div
                className="text-sm sm:text-base"
                dangerouslySetInnerHTML={{ __html: parsed.html }}
              />
            ) : (
              <p className="text-sm text-brand-ink-muted">
                Changelog not yet published for this environment. The next
                deploy will populate this page.
              </p>
            )}
          </article>

          {/* Sidebar (desktop only) */}
          <aside
            aria-label="Jump to release"
            className="hidden lg:block"
          >
            <div className="sticky top-24 rounded-2xl border border-brand-cyan/15 bg-brand-navy-elev-1 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
                Releases
              </p>
              {parsed.releases.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {parsed.releases.map((r) => (
                    <li key={r.id}>
                      <a
                        href={`#${r.id}`}
                        className="block truncate rounded-md px-2 py-1 text-xs text-brand-ink-muted transition-colors hover:bg-brand-cyan/10 hover:text-brand-cyan"
                      >
                        {r.label}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 text-xs text-brand-ink-muted">
                  No releases indexed yet.
                </p>
              )}
            </div>
          </aside>
        </div>

        {/* Footer CTA */}
        <div className="mt-16 rounded-3xl border border-brand-cyan/20 bg-brand-navy-elev-1 p-10 text-center shadow-lg lux-glow-cyan">
          <h2 className="text-2xl font-bold text-brand-ink">
            See what&apos;s next
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-brand-ink-muted">
            The roadmap lays out the eight-stage journey from founder idea to
            exit, plus this quarter&apos;s ship list. Pricing shows what each tier
            unlocks. The security audit summary tracks disclaimer registry and
            hash-chain integrity.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/roadmap"
              className="inline-flex items-center gap-2 rounded-2xl bg-brand-cyan px-6 py-3 text-sm font-semibold text-brand-navy transition-colors hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Roadmap
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-2xl border border-brand-cyan/40 px-6 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Pricing
            </Link>
            <Link
              href="/security-audit"
              className="inline-flex items-center gap-2 rounded-2xl border border-brand-cyan/40 px-6 py-3 text-sm font-semibold text-brand-ink transition-colors hover:bg-brand-cyan/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              Security audit
            </Link>
          </div>
          <p className="mt-6 text-xs text-brand-ink-muted">
            Not financial advice. Auschain PTY LTD · ACN 659 615 111 · Sydney
            NSW.
          </p>
        </div>
      </main>

      <Footer />
    </div>
  );
}
