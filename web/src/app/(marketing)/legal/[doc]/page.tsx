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
 *   - /legal/privacy       → content/legal/privacy-v2.mdx (the ONE privacy
 *                            policy — `/privacy` 301s here since 2026-09-10)
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

type DocSlug = "terms" | "privacy" | "disclaimers" | "mentor-access-policy";

const DOC_META: Record<DocSlug, { title: string; description: string; heading: string }> = {
  terms: {
    title: "Terms of Service",
    description:
      "Auschain PTY LTD Terms of Service governing use of the BlockID.au platform.",
    heading: "Terms of Service",
  },
  privacy: {
    title: "Privacy Policy",
    description:
      "How Auschain PTY LTD collects, holds, uses, and discloses personal information under the Privacy Act 1988 (Cth).",
    heading: "Privacy Policy",
  },
  disclaimers: {
    title: "Legal disclaimers",
    description:
      "Canonical disclaimers surfaced across BlockID.au — advice, wholesale, equity offer, share issuance, trial, and more.",
    heading: "Legal disclaimers",
  },
  "mentor-access-policy": {
    title: "Mentor Access Policy",
    description:
      "What mentors see when a founder shares access, how long consent lasts, and how founders can revoke access at any time.",
    heading: "Mentor Access Policy",
  },
};

function isDocSlug(v: string): v is DocSlug {
  return (
    v === "terms" ||
    v === "privacy" ||
    v === "disclaimers" ||
    v === "mentor-access-policy"
  );
}

// Read at request time so a hot-swap of a legal MDX file does not require a
// full rebuild.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateStaticParams(): { doc: DocSlug }[] {
  return [
    { doc: "terms" },
    { doc: "privacy" },
    { doc: "disclaimers" },
    { doc: "mentor-access-policy" },
  ];
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
    if (doc === "mentor-access-policy") {
      const raw = readFileSync(
        path.join(root, "legal", "mentor-access-policy.mdx"),
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
    (_, inner: string) =>
      // Encode @ as &#64; so Cloudflare Email Obfuscation doesn't replace
      // email addresses inside <code> with broken /cdn-cgi/l/email-protection links.
      `<code class="rounded bg-surface-raised px-1.5 py-0.5 text-[0.85em] text-action">${inner.replace(/@/g, "&#64;")}</code>`,
  );
  s = s.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-primary">$1</strong>',
  );
  // Single-star emphasis (*Privacy Act 1988*, *attributed only*) — runs
  // after bold so the `**` pairs are already consumed.
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return s;
}

/**
 * Pipe tables (`| a | b |`, with the `|---|---|` separator row) → a real
 * `<table>`. The privacy policy's retention table (clause 4) is the only
 * consumer; anything else stays a paragraph. Cells go through renderInline
 * so `**bold**` and `` `code` `` inside a cell still render.
 */
function renderTable(rows: string[]): string {
  const cells = (row: string): string[] =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const isSeparator = (row: string): boolean => /^\|?\s*:?-{2,}/.test(row);
  const [head, ...rest] = rows;
  const body = rest.filter((r) => !isSeparator(r));
  const th = cells(head ?? "")
    .map(
      (c) =>
        `<th scope="col" class="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-primary">${renderInline(c)}</th>`,
    )
    .join("");
  const tr = body
    .map(
      (r) =>
        `<tr class="border-t border-line-subtle align-top">${cells(r)
          .map((c) => `<td class="px-3 py-2 text-secondary">${renderInline(c)}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<div class="mt-4 overflow-x-auto"><table class="w-full text-sm"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

/**
 * `## Heading {#anchor}` → `<h2 id="anchor">Heading</h2>`.
 *
 * The site footer deep-links `/legal/privacy#security`, and the MDX has no
 * other way to name an anchor; a heading without a suffix renders with no id.
 */
function splitHeadingAnchor(text: string): { text: string; id: string | null } {
  const m = /^(.*?)\s*\{#([a-z0-9-]+)\}\s*$/.exec(text);
  if (!m) return { text, id: null };
  return { text: m[1]!, id: m[2]! };
}

function headingTag(level: 2 | 3, raw: string, className: string): string {
  const { text, id } = splitHeadingAnchor(raw);
  const idAttr = id ? ` id="${id}"` : "";
  return `<h${level}${idAttr} class="${className}">${renderInline(text)}</h${level}>`;
}

function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;
  // Raw markdown of the most recent `<li>` so a wrapped item can be re-rendered
  // once its indented continuation lines arrive.
  let liSource = "";
  let paraBuf: string[] = [];
  let tableBuf: string[] = [];

  const flushList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  const flushTable = () => {
    if (tableBuf.length > 0) {
      out.push(renderTable(tableBuf));
      tableBuf = [];
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

  for (const line of lines) {
    const trimmed = line.trim();

    // Table rows are contiguous `|`-prefixed lines; any other line ends the
    // table. Checked first so a `|---|` separator is never mistaken for `---`.
    if (trimmed.startsWith("|")) {
      flushPara();
      flushList();
      tableBuf.push(trimmed);
      continue;
    }
    flushTable();

    if (trimmed === "") {
      flushPara();
      flushList();
      continue;
    }

    if (trimmed === "---") {
      flushPara();
      flushList();
      out.push('<hr class="my-10 border-line-subtle" />');
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushPara();
      flushList();
      out.push(
        headingTag(
          3,
          trimmed.slice(4),
          "mt-8 text-lg font-semibold tracking-tight text-primary",
        ),
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushPara();
      flushList();
      out.push(
        headingTag(
          2,
          trimmed.slice(3),
          "mt-12 text-2xl font-bold tracking-tight text-primary sm:text-3xl",
        ),
      );
      continue;
    }
    if (trimmed.startsWith("# ")) {
      flushPara();
      flushList();
      // The page's one <h1> is the MarketingHero title; a document's own
      // `# Title` (six of them on /legal/disclaimers, one each on terms /
      // privacy) renders as an h2 so every legal page has exactly one h1
      // (release QA-1 #16).
      out.push(
        headingTag(
          2,
          trimmed.slice(2),
          "mt-6 text-3xl font-bold tracking-tight text-primary sm:text-4xl",
        ),
      );
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
      liSource = trimmed.slice(2);
      out.push(`<li class="leading-relaxed">${renderInline(liSource)}</li>`);
      continue;
    }
    if (trimmed.startsWith("<!--")) continue;

    // Indented continuation of a wrapped list item (`- **Identity** — your
    // name,\n  email address`) joins the previous <li> instead of breaking
    // the list and starting a paragraph. Inline markup is re-rendered over
    // the joined text so a `**bold**` that wraps across the break closes.
    if (inList && /^\s/.test(line) && out[out.length - 1]?.startsWith("<li ")) {
      liSource = `${liSource} ${trimmed}`;
      out[out.length - 1] = `<li class="leading-relaxed">${renderInline(liSource)}</li>`;
      continue;
    }

    flushList();
    paraBuf.push(trimmed);
  }

  flushPara();
  flushList();
  flushTable();

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
        <article className="rounded-3xl border border-line-subtle bg-surface-sunken p-8 sm:p-10">
          {html ? (
            <div
              className="text-sm sm:text-base"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <p className="text-sm text-secondary">
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
