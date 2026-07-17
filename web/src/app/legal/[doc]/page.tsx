/**
 * /legal/[doc] — public legal document renderer.
 *
 * Reads the corresponding MDX file from `web/content/legal/*` at request
 * time and streams the body through the same minimal markdown renderer as
 * `/changelog`. We deliberately do NOT install `marked` — the changelog
 * shape is narrow enough that a hand-rolled renderer covers it.
 *
 * Supported slugs:
 *   - /legal/terms         → content/legal/terms-v2.mdx
 *   - /legal/privacy       → content/legal/privacy-v2.mdx
 *   - /legal/disclaimers   → all files under content/legal/disclaimers/*-en.mdx,
 *                            concatenated in a stable order.
 */

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";

const SITE_URL = "https://blockid.au";

type DocSlug = "terms" | "privacy" | "disclaimers";

const DOC_META: Record<DocSlug, { title: string; description: string; heading: string }> = {
  terms: {
    title: "Terms of Service — BlockID.au",
    description:
      "Auschain PTY LTD Terms of Service governing use of the BlockID.au platform.",
    heading: "Terms of Service",
  },
  privacy: {
    title: "Privacy Policy — BlockID.au",
    description:
      "How Auschain PTY LTD collects, holds, uses, and discloses personal information under the Privacy Act 1988 (Cth).",
    heading: "Privacy Policy",
  },
  disclaimers: {
    title: "Legal disclaimers — BlockID.au",
    description:
      "Canonical disclaimers surfaced across BlockID.au — advice, wholesale, equity offer, share issuance, trial, and more.",
    heading: "Legal disclaimers",
  },
};

function isDocSlug(v: string): v is DocSlug {
  return v === "terms" || v === "privacy" || v === "disclaimers";
}

// Read at request time so a hot-swap of a legal MDX file does not require a
// full rebuild.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateStaticParams(): { doc: DocSlug }[] {
  return [{ doc: "terms" }, { doc: "privacy" }, { doc: "disclaimers" }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ doc: string }>;
}): Promise<Metadata> {
  const { doc } = await params;
  if (!isDocSlug(doc)) return {};
  const meta = DOC_META[doc];
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `${SITE_URL}/legal/${doc}` },
    robots: { index: true, follow: true },
  };
}

// ---------------------------------------------------------------------------
// MDX loading
// ---------------------------------------------------------------------------

function contentRoot(): string {
  const candidates = [
    path.join(process.cwd(), "content"),
    path.join(process.cwd(), "web", "content"),
  ];
  for (const p of candidates) {
    try {
      readdirSync(p);
      return p;
    } catch {
      // try next
    }
  }
  return candidates[0]!;
}

function stripFrontmatter(mdx: string): string {
  const noBom =
    mdx.charCodeAt(0) === 0xfeff ? mdx.slice(1) : mdx;
  if (!noBom.startsWith("---")) return noBom;
  const end = noBom.indexOf("\n---", 3);
  if (end === -1) return noBom;
  const after = noBom.indexOf("\n", end + 4);
  return after === -1 ? "" : noBom.slice(after + 1);
}

function readLegalBody(doc: DocSlug): string | null {
  const root = contentRoot();
  try {
    if (doc === "terms") {
      const raw = readFileSync(path.join(root, "legal", "terms-v2.mdx"), "utf8");
      return stripFrontmatter(raw);
    }
    if (doc === "privacy") {
      const raw = readFileSync(
        path.join(root, "legal", "privacy-v2.mdx"),
        "utf8",
      );
      return stripFrontmatter(raw);
    }
    const dir = path.join(root, "legal", "disclaimers");
    const entries = readdirSync(dir)
      .filter((f) => f.endsWith("-en.mdx"))
      .sort();
    const parts: string[] = [];
    for (const f of entries) {
      const body = stripFrontmatter(readFileSync(path.join(dir, f), "utf8"));
      parts.push(body.trim());
    }
    return parts.join("\n\n---\n\n");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Minimal markdown → HTML string renderer.
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
    '<code class="rounded bg-[var(--fintech-surface)] px-1.5 py-0.5 text-[0.85em] text-[var(--fintech-accent)]">$1</code>',
  );
  s = s.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-[var(--fintech-ink)]">$1</strong>',
  );
  return s;
}

function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
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
        `<p class="mt-3 leading-relaxed text-[var(--fintech-ink-muted)]">${renderInline(
          paraBuf.join(" "),
        )}</p>`,
      );
      paraBuf = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushPara();
      flushList();
      continue;
    }

    if (trimmed === "---") {
      flushPara();
      flushList();
      out.push('<hr class="my-10 border-[var(--fintech-border)]" />');
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushPara();
      flushList();
      out.push(
        `<h3 class="mt-8 text-lg font-semibold tracking-tight text-[var(--fintech-ink)]">${renderInline(
          trimmed.slice(4),
        )}</h3>`,
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushPara();
      flushList();
      out.push(
        `<h2 class="mt-12 text-2xl font-bold tracking-tight text-[var(--fintech-ink)] sm:text-3xl">${renderInline(
          trimmed.slice(3),
        )}</h2>`,
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushPara();
      flushList();
      out.push(
        `<h1 class="mt-6 text-3xl font-bold tracking-tight text-[var(--fintech-ink)] sm:text-4xl">${renderInline(
          trimmed.slice(2),
        )}</h1>`,
      );
      continue;
    }
    if (trimmed.startsWith("- ")) {
      flushPara();
      if (!inList) {
        out.push(
          '<ul class="mt-4 space-y-2 list-disc pl-6 text-[var(--fintech-ink-muted)] marker:text-[var(--fintech-accent)]">',
        );
        inList = true;
      }
      out.push(
        `<li class="leading-relaxed">${renderInline(trimmed.slice(2))}</li>`,
      );
      continue;
    }
    if (trimmed.startsWith("<!--")) continue;

    flushList();
    paraBuf.push(trimmed);
  }

  flushPara();
  flushList();

  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function LegalDocPage({
  params,
}: {
  params: Promise<{ doc: string }>;
}) {
  const { doc } = await params;
  if (!isDocSlug(doc)) notFound();
  const body = readLegalBody(doc);
  const html = body ? renderMarkdown(body) : null;
  const meta = DOC_META[doc];

  return (
    <MarketingShell>
      <MarketingHero
        eyebrow="Legal"
        title={meta.heading}
        subtitle={meta.description}
      />

      <section
        aria-label={`${meta.heading} body`}
        className="mx-auto max-w-3xl px-6 pb-12"
      >
        <article className="rounded-3xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-8 sm:p-10">
          {html ? (
            <div
              className="text-sm sm:text-base"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-[var(--fintech-ink-muted)]">
              Document not yet published for this environment. The next deploy
              will populate this page.
            </p>
          )}
        </article>
      </section>

      <MarketingCtaStrip
        headline="Questions about the fine print?"
        primary={{ href: "/contact?topic=legal", label: "Contact legal" }}
        secondary={{ href: "/legal/disclaimers", label: "All disclaimers" }}
      />
    </MarketingShell>
  );
}
