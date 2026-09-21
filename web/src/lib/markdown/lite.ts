/**
 * markdown-lite — a small, dependency-free Markdown → HTML renderer for the
 * repo documents the site renders in-app (G22-C: `docs/api/institutional.md`
 * at /docs/api/institutional). Deliberately narrow, like the /legal and
 * /changelog renderers: the documents are ours, written in a fixed dialect.
 *
 * Supported: `#` (captured as the title, not emitted), `##` / `###`
 * headings with slug ids (and a table of contents), paragraphs, `-` bullet
 * lists with indented continuation lines, pipe tables (`|---|` separator),
 * fenced code blocks (``` with an optional language, content escaped and
 * never inline-processed), `---` rules, and inline `code`, **bold**,
 * *emphasis* and `[text](href)` links. Everything else is a paragraph.
 *
 * Output is HTML with the template's token classes only (no raw colours) so
 * it drops into `<Prose measure="wide">` and inherits `.tpl-prose` styles.
 * Every string is HTML-escaped before markup is added; `href`s are limited
 * to http(s), mailto, `/` and `#` so a document can never inject a script
 * URL. Pure — no React, no fs.
 */

export interface MarkdownHeading {
  id: string;
  level: 2 | 3;
  text: string;
}

export interface RenderedMarkdown {
  /** The first `# ` heading, without markup; null when the document has none. */
  title: string | null;
  html: string;
  headings: MarkdownHeading[];
}

const CODE_CLASS = "rounded bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.85em] text-primary break-words [overflow-wrap:anywhere]";
const PRE_CLASS = "mt-4 max-w-full overflow-x-auto rounded-xl border border-line-subtle bg-surface-sunken p-4 font-mono text-xs leading-relaxed text-primary";
const TABLE_WRAP_CLASS = "mt-4 max-w-full overflow-x-auto rounded-xl border border-line-subtle bg-surface";

export function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** `Who it is for` → `who-it-is-for`; keeps ASCII letters/digits, collapses the rest to `-`. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "section";
}

function safeHref(raw: string): string | null {
  const href = raw.trim();
  // No protocol-relative `//host` links (review P3): only absolute http(s), mailto, same-site paths and anchors.
  if (/^(https?:\/\/|mailto:|\/(?!\/)|#)/i.test(href)) return href;
  return null;
}

/** Inline markup: code first (so `**` inside code stays literal), then links, bold, emphasis. */
export function renderInline(input: string): string {
  const codeRuns: string[] = [];
  // Pull code spans out before any other processing.
  let s = input.replace(/`([^`]+)`/g, (_, inner: string) => {
    // `&#64;` keeps Cloudflare's e-mail obfuscation away from addresses inside <code>.
    codeRuns.push(`<code class="${CODE_CLASS}">${escapeHtml(inner).replace(/@/g, "&#64;")}</code>`);
    return `\u0000${codeRuns.length - 1}\u0000`;
  });
  s = escapeHtml(s);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text: string, href: string) => {
    const safe = safeHref(href.replace(/&amp;/g, "&"));
    if (!safe) return text;
    const external = /^https?:\/\//i.test(safe);
    return `<a href="${escapeHtml(safe)}"${external ? ' rel="noopener"' : ""}>${text}</a>`;
  });
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codeRuns[Number(i)] ?? "");
}

function renderTable(rows: string[]): string {
  const cells = (row: string): string[] =>
    row
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split(/(?<!\\)\|/)
      .map((c) => c.replace(/\\\|/g, "|").trim());
  const isSeparator = (row: string): boolean => /^\|?\s*:?-{2,}/.test(row);
  const [head, ...rest] = rows;
  const body = rest.filter((r) => !isSeparator(r));
  const th = cells(head ?? "")
    .map((c) => `<th scope="col">${renderInline(c)}</th>`)
    .join("");
  const tr = body.map((r) => `<tr>${cells(r).map((c) => `<td>${renderInline(c)}</td>`).join("")}</tr>`).join("");
  return `<div class="${TABLE_WRAP_CLASS}"><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table></div>`;
}

export function renderMarkdownLite(md: string): RenderedMarkdown {
  const lines = md.replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  const headings: MarkdownHeading[] = [];
  const seenIds = new Map<string, number>();
  let title: string | null = null;

  let para: string[] = [];
  let list: string[] = [];
  let table: string[] = [];
  let fence: { lang: string; lines: string[] } | null = null;

  const uniqueId = (text: string): string => {
    const base = slugify(text);
    const n = seenIds.get(base) ?? 0;
    seenIds.set(base, n + 1);
    return n === 0 ? base : `${base}-${n + 1}`;
  };
  const flushPara = () => {
    if (para.length > 0) {
      out.push(`<p>${renderInline(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length > 0) {
      out.push(`<ul>${list.map((item) => `<li>${renderInline(item)}</li>`).join("")}</ul>`);
      list = [];
    }
  };
  const flushTable = () => {
    if (table.length > 0) {
      out.push(renderTable(table));
      table = [];
    }
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushTable();
  };

  for (const raw of lines) {
    // Fenced code: everything until the closing fence is literal.
    if (fence) {
      if (/^```/.test(raw.trim())) {
        const langAttr = fence.lang ? ` data-lang="${escapeHtml(fence.lang)}"` : "";
        out.push(`<pre class="${PRE_CLASS}"${langAttr}><code>${escapeHtml(fence.lines.join("\n"))}</code></pre>`);
        fence = null;
      } else {
        fence.lines.push(raw);
      }
      continue;
    }
    const trimmed = raw.trim();
    const fenceOpen = /^```([a-zA-Z0-9_-]*)\s*$/.exec(trimmed);
    if (fenceOpen) {
      flushAll();
      fence = { lang: fenceOpen[1] ?? "", lines: [] };
      continue;
    }

    // Table rows are contiguous `|` lines; checked before `---` so the separator row is never a rule.
    if (trimmed.startsWith("|")) {
      flushPara();
      flushList();
      table.push(trimmed);
      continue;
    }
    flushTable();

    if (trimmed === "") {
      flushPara();
      flushList();
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      flushAll();
      out.push('<hr class="my-8 border-line-subtle" />');
      continue;
    }

    const h1 = /^#\s+(.+)$/.exec(trimmed);
    if (h1) {
      flushAll();
      if (title === null) title = h1[1]!.replace(/`/g, "").trim();
      continue;
    }
    const h = /^(##|###)\s+(.+)$/.exec(trimmed);
    if (h) {
      flushAll();
      const level = h[1] === "##" ? 2 : 3;
      const text = h[2]!.trim();
      const id = uniqueId(text);
      headings.push({ id, level, text: text.replace(/`/g, "") });
      out.push(`<h${level} id="${id}" class="scroll-mt-24">${renderInline(text)}</h${level}>`);
      continue;
    }

    const bullet = /^[-*]\s+(.+)$/.exec(trimmed);
    if (bullet) {
      flushPara();
      list.push(bullet[1]!);
      continue;
    }
    // An indented line while a list is open continues the last item.
    if (list.length > 0 && /^\s{2,}\S/.test(raw)) {
      list[list.length - 1] = `${list[list.length - 1]} ${trimmed}`;
      continue;
    }
    flushList();
    para.push(trimmed);
  }
  if (fence) {
    out.push(`<pre class="${PRE_CLASS}"><code>${escapeHtml(fence.lines.join("\n"))}</code></pre>`);
  }
  flushAll();

  return { title, html: out.join("\n"), headings };
}
