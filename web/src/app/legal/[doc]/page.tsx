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
import Link from "next/link";
import { notFound } from "next/navigation";
import { ScrollText } from "lucide-react";
import { NavV2 } from "@/components/landing/nav-v2";
import { NotFinancialAdvice } from "@/components/legal/not-financial-advice";

const SITE_URL = "https://blockid.au";

type DocSlug = "terms" | "privacy" | "disclaimers";

const DOC_META: Record<DocSlug, { title: string; description: string }> = {
  terms: {
    title: "Terms of Service — BlockID.au",
    description:
      "Auschain PTY LTD Terms of Service governing use of the BlockID.au platform.",
  },
  privacy: {
    title: "Privacy Policy — BlockID.au",
    description:
      "How Auschain PTY LTD collects, holds, uses, and discloses personal information under the Privacy Act 1988 (Cth).",
  },
  disclaimers: {
    title: "Legal disclaimers — BlockID.au",
    description:
      "Canonical disclaimers surfaced across BlockID.au — advice, wholesale, equity offer, share issuance, trial, and more.",
  },
};

function isDocSlug(v: string): v is DocSlug {
  return v === "terms" || v === "privacy" || v === "disclaimers";
}

// Read at request time so a hot-swap of a legal MDX file (e.g. an ACL s31
// 14-day notice window bump) does not require a full rebuild.
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
  // Match the multi-path fallback used by /changelog + /roadmap so this works
  // whether `next start` is invoked from web/ or from repo root.
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
  // Trim a leading `--- ... ---` block. Simple state machine so we do not
  // need a YAML parser. Also strip an optional BOM (U+FEFF) code-point if
  // the MDX file was saved with one.
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
    // disclaimers → concatenate every English disclaimer in filename order so
    // the output is stable across deploys.
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
// Minimal markdown → HTML string renderer (mirrors /changelog).
// Supported: # / ## / ###, `- item` lists, **bold**, `code`, paragraphs, and
// `---` horizontal rules (used as file separators when concatenating).
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
    '<code class="rounded bg-brand-navy-deep/60 px-1.5 py-0.5 text-[0.85em] text-brand-cyan">$1</code>',
  );
  s = s.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-brand-ink">$1</strong>',
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
        `<p class="mt-3 leading-relaxed text-brand-ink-muted">${renderInline(
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
      out.push('<hr class="my-10 border-brand-cyan/15" />');
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushPara();
      flushList();
      out.push(
        `<h3 class="mt-8 text-lg font-semibold tracking-tight text-brand-ink">${renderInline(
          trimmed.slice(4),
        )}</h3>`,
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushPara();
      flushList();
      out.push(
        `<h2 class="mt-12 text-2xl font-bold tracking-tight text-brand-ink sm:text-3xl">${renderInline(
          trimmed.slice(3),
        )}</h2>`,
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushPara();
      flushList();
      out.push(
        `<h1 class="mt-6 text-3xl font-bold tracking-tight text-brand-ink sm:text-4xl">${renderInline(
          trimmed.slice(2),
        )}</h1>`,
      );
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
      out.push(
        `<li class="leading-relaxed">${renderInline(trimmed.slice(2))}</li>`,
      );
      continue;
    }
    // HTML-comment guard: pass raw through as a paragraph would be wrong; drop.
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

  const label =
    doc === "terms"
      ? "Terms of Service"
      : doc === "privacy"
        ? "Privacy Policy"
        : "Legal disclaimers";

  return (
    <div data-theme="lux" className="min-h-svh bg-brand-navy-deep text-brand-ink">
      <NavV2 />

      <main className="mx-auto max-w-3xl px-4 pb-24 pt-16 sm:px-6">
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-cyan">
            <ScrollText aria-hidden="true" className="h-3.5 w-3.5" />
            Legal
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight text-brand-ink sm:text-5xl">
            {label}
          </h1>
        </div>

        <article className="mt-12 rounded-2xl border border-brand-cyan/15 bg-brand-navy-elev-1 p-8 sm:p-10">
          {html ? (
            <div
              className="text-sm sm:text-base"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-brand-ink-muted">
              Document not yet published for this environment. The next deploy
              will populate this page.
            </p>
          )}
        </article>
      </main>

      <footer className="border-t border-white/5 bg-brand-navy-deep">
        <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-xs text-brand-ink-muted">
              &copy; {new Date().getFullYear()} Auschain Pty Ltd (ACN 659 615
              111). BlockID.au.
            </p>
            <nav aria-label="Footer">
              <ul className="flex flex-wrap items-center gap-4 text-xs text-brand-ink-muted">
                <li>
                  <Link href="/legal/terms" className="hover:text-brand-ink">
                    Terms
                  </Link>
                </li>
                <li>
                  <Link href="/legal/privacy" className="hover:text-brand-ink">
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/legal/disclaimers"
                    className="hover:text-brand-ink"
                  >
                    Disclaimers
                  </Link>
                </li>
                <li>
                  <Link href="/changelog" className="hover:text-brand-ink">
                    Changelog
                  </Link>
                </li>
              </ul>
            </nav>
          </div>
          <div className="mt-6">
            <NotFinancialAdvice kind="not_financial_advice" compact />
          </div>
        </div>
      </footer>
    </div>
  );
}
