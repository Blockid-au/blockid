"use client";

/**
 * Renders markdown content as HTML with proper styling.
 * Uses a simple markdown-to-HTML approach without external dependencies.
 */
export function InsightBody({ content }: { content: string }) {
  const html = markdownToHtml(content);

  return (
    <div
      className="prose prose-ink max-w-none
        prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-ink-900
        prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
        prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
        prose-p:text-base prose-p:leading-relaxed prose-p:text-ink-700
        prose-li:text-ink-700
        prose-a:text-brand-600 prose-a:font-medium prose-a:no-underline hover:prose-a:underline
        prose-strong:text-ink-900 prose-strong:font-semibold
        prose-blockquote:border-l-brand-500 prose-blockquote:bg-brand-50 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg
        prose-img:rounded-xl prose-img:shadow-md prose-img:border prose-img:border-surface-200
        prose-code:text-brand-700 prose-code:bg-brand-50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
        prose-pre:bg-ink-900 prose-pre:rounded-xl
        prose-table:border-collapse
        prose-th:border prose-th:border-surface-300 prose-th:px-3 prose-th:py-2 prose-th:bg-surface-100 prose-th:text-xs prose-th:font-semibold
        prose-td:border prose-td:border-surface-200 prose-td:px-3 prose-td:py-2 prose-td:text-sm
      "
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/** Lightweight markdown → HTML (covers common patterns, no external deps) */
function markdownToHtml(md: string): string {
  let html = md;

  // Escape HTML entities in code blocks first
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<pre><code class="language-${lang}">${escaped}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Images with alt text
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy" />');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Bold & italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Headings
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>");

  // Horizontal rules
  html = html.replace(/^---$/gm, "<hr />");

  // Unordered lists
  html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Ordered lists
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Paragraphs (lines not already wrapped)
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (
        trimmed.startsWith("<h") ||
        trimmed.startsWith("<ul") ||
        trimmed.startsWith("<ol") ||
        trimmed.startsWith("<pre") ||
        trimmed.startsWith("<blockquote") ||
        trimmed.startsWith("<hr") ||
        trimmed.startsWith("<img") ||
        trimmed.startsWith("<table")
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, "<br />")}</p>`;
    })
    .join("\n");

  return html;
}
