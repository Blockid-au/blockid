/**
 * /legal-templates/[slug] — public preview of a single AU legal template.
 *
 * Server-rendered from the raw markdown in `web/content/templates/legal/…`.
 * Uses the platform's minimal markdown renderer (same shape as /legal/[doc])
 * so we don't introduce a client-side dep.
 *
 * Includes:
 *   - prominent disclaimer at top
 *   - placeholder token list
 *   - "Download raw template" CTA → /api/templates/legal/[slug]?download=1
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getTemplate,
  listTemplates,
  readTemplateRaw,
} from "@/lib/templates/legal-templates";

const SITE_URL = "https://blockid.au";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function generateStaticParams(): { slug: string }[] {
  return listTemplates().map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tpl = getTemplate(slug);
  if (!tpl) return {};
  return {
    title: `${tpl.title} — BlockID.au`,
    description: tpl.summary,
    alternates: { canonical: `${SITE_URL}/legal-templates/${tpl.slug}` },
    robots: { index: true, follow: true },
  };
}

// ---------------------------------------------------------------------------
// Minimal markdown → HTML renderer (paragraphs, headings, lists, hr, code,
// bold, italics). Sufficient for hand-authored legal templates.
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
    '<code class="rounded bg-slate-100 px-1.5 py-0.5 text-[0.85em] dark:bg-slate-800">$1</code>',
  );
  s = s.replace(
    /\*\*([^*]+)\*\*/g,
    '<strong class="font-semibold text-slate-900 dark:text-slate-100">$1</strong>',
  );
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  return s;
}

function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let paraBuf: string[] = [];
  let inBlockquote = false;

  const flushList = () => {
    if (inUl) {
      out.push("</ul>");
      inUl = false;
    }
    if (inOl) {
      out.push("</ol>");
      inOl = false;
    }
  };
  const flushPara = () => {
    if (paraBuf.length > 0) {
      out.push(
        `<p class="mt-3 leading-relaxed text-slate-700 dark:text-slate-300">${renderInline(
          paraBuf.join(" "),
        )}</p>`,
      );
      paraBuf = [];
    }
  };
  const flushQuote = () => {
    if (inBlockquote) {
      out.push("</blockquote>");
      inBlockquote = false;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === "") {
      flushPara();
      flushList();
      flushQuote();
      continue;
    }

    if (trimmed === "---") {
      flushPara();
      flushList();
      flushQuote();
      out.push('<hr class="my-8 border-slate-200 dark:border-slate-800" />');
      continue;
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara();
      flushList();
      flushQuote();
      const level = h[1]!.length;
      const text = renderInline(h[2]!);
      const cls =
        level === 1
          ? "mt-10 text-2xl font-bold text-slate-900 dark:text-slate-100"
          : level === 2
            ? "mt-8 text-xl font-semibold text-slate-900 dark:text-slate-100"
            : level === 3
              ? "mt-6 text-lg font-semibold text-slate-900 dark:text-slate-100"
              : "mt-5 text-base font-semibold text-slate-900 dark:text-slate-100";
      out.push(`<h${level} class="${cls}">${text}</h${level}>`);
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(trimmed)) {
      flushPara();
      flushList();
      if (!inBlockquote) {
        out.push(
          '<blockquote class="mt-4 border-l-4 border-slate-300 bg-slate-50 px-4 py-2 text-sm italic text-slate-700 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-300">',
        );
        inBlockquote = true;
      }
      out.push(
        `<p>${renderInline(trimmed.replace(/^>\s?/, ""))}</p>`,
      );
      continue;
    } else {
      flushQuote();
    }

    // Numbered list
    const ol = /^(\d+)\.\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushPara();
      if (inUl) {
        out.push("</ul>");
        inUl = false;
      }
      if (!inOl) {
        out.push(
          '<ol class="mt-3 list-decimal space-y-1 pl-6 text-slate-700 dark:text-slate-300">',
        );
        inOl = true;
      }
      out.push(`<li>${renderInline(ol[2]!)}</li>`);
      continue;
    }

    // Bulleted list
    if (/^[-*]\s+/.test(trimmed)) {
      flushPara();
      if (inOl) {
        out.push("</ol>");
        inOl = false;
      }
      if (!inUl) {
        out.push(
          '<ul class="mt-3 list-disc space-y-1 pl-6 text-slate-700 dark:text-slate-300">',
        );
        inUl = true;
      }
      out.push(`<li>${renderInline(trimmed.replace(/^[-*]\s+/, ""))}</li>`);
      continue;
    }

    // Paragraph accumulator
    paraBuf.push(trimmed);
  }

  flushPara();
  flushList();
  flushQuote();
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function LegalTemplateDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tpl = getTemplate(slug);
  if (!tpl) notFound();

  const raw = await readTemplateRaw(slug);
  if (raw == null) notFound();

  const html = renderMarkdown(raw);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <nav className="mb-6 text-sm text-slate-500 dark:text-slate-400">
        <Link href="/legal-templates" className="hover:underline">
          ← All legal templates
        </Link>
      </nav>

      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {tpl.category}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
          {tpl.title}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {tpl.summary}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a
            href={`/api/templates/legal/${tpl.slug}?download=1`}
            className="inline-flex items-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            Download this template (.md)
          </a>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            v{tpl.version} · revised {tpl.revision_date}
          </span>
        </div>
      </header>

      <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        <strong>Template only — not legal advice.</strong> {tpl.disclaimer}
      </div>

      <aside className="mb-8 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Placeholders to fill in
        </h2>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
          Every <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">{`{{token}}`}</code>
          {" "}below must be replaced before the document is signed. Tokens
          wrapped like <code className="rounded bg-slate-200 px-1 dark:bg-slate-700">{`{{#name}}…{{/name}}`}</code>
          {" "}are variant toggles.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {tpl.placeholders.map((p) => (
            <li
              key={p}
              className="rounded bg-white px-2 py-0.5 text-xs font-mono text-slate-700 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
            >
              {`{{${p}}}`}
            </li>
          ))}
        </ul>
      </aside>

      <article
        className="prose prose-slate max-w-none dark:prose-invert"
        // Rendered HTML is produced by our own renderer over trusted
        // source-controlled markdown, not user input.
        dangerouslySetInnerHTML={{ __html: html }}
      />

      <footer className="mt-12 border-t border-slate-200 pt-6 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Sources:
        <ul className="mt-2 space-y-1">
          {tpl.sources.map((s) => (
            <li key={s.url}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </footer>
    </main>
  );
}
