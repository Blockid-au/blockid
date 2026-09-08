// Minimal, allow-list Markdown renderer for data-room document bodies.
//
// Bodies come from two places: composeRoomDocuments (a dialect we control) and
// /api/data-room/auto-fill (LLM output, i.e. untrusted-shaped text). So this
// builds a React tree and never touches dangerouslySetInnerHTML — anything
// outside the allow-list renders as literal text rather than markup.
//
// Supported: # h1-### h3, paragraphs, - bullets, GFM pipe tables, --- rules,
// and inline **bold** / `code`.

import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith("**")) {
      out.push(
        <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-primary">
          {tok.slice(2, -2)}
        </strong>,
      );
    } else {
      out.push(
        <code
          key={`${keyPrefix}-c${i}`}
          className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em] text-secondary"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    }
    last = m.index + tok.length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());
}

const isDivider = (line: string) => /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");

export function DocMarkdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let bullets: string[] = [];

  const flushPara = (key: string) => {
    if (para.length === 0) return;
    blocks.push(
      <p key={key} className="text-sm leading-relaxed text-secondary">
        {inline(para.join(" "), key)}
      </p>,
    );
    para = [];
  };
  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key} className="ml-4 list-disc space-y-1 text-sm leading-relaxed text-secondary">
        {bullets.map((b, i) => (
          <li key={`${key}-${i}`}>{inline(b, `${key}-${i}`)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const trimmed = line.trim();
    const key = `l${i}`;

    if (trimmed === "") {
      flushPara(key);
      flushBullets(key);
      continue;
    }

    if (trimmed === "---" || trimmed === "***") {
      flushPara(key);
      flushBullets(key);
      blocks.push(<hr key={key} className="border-line-subtle" />);
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushPara(key);
      flushBullets(key);
      const level = heading[1]!.length;
      const text = heading[2]!;
      const cls =
        level === 1
          ? "text-lg font-semibold tracking-tight text-primary"
          : level === 2
            ? "text-base font-semibold text-primary"
            : "text-sm font-semibold text-primary";
      blocks.push(
        level === 1 ? (
          <h3 key={key} className={cls}>{inline(text, key)}</h3>
        ) : level === 2 ? (
          <h4 key={key} className={cls}>{inline(text, key)}</h4>
        ) : (
          <h5 key={key} className={cls}>{inline(text, key)}</h5>
        ),
      );
      continue;
    }

    // GFM pipe table: header row, divider, then body rows.
    if (trimmed.startsWith("|") && isDivider(lines[i + 1]?.trim() ?? "")) {
      flushPara(key);
      flushBullets(key);
      const head = splitRow(trimmed);
      const body: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j]!.trim().startsWith("|")) {
        body.push(splitRow(lines[j]!.trim()));
        j++;
      }
      i = j - 1;
      blocks.push(
        <div key={key} className="overflow-x-auto">
          <table className="w-full min-w-[20rem] border-collapse text-sm">
            <thead>
              <tr>
                {head.map((h, hi) => (
                  <th
                    key={`${key}-h${hi}`}
                    scope="col"
                    className="border-b border-line-subtle py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, ri) => (
                <tr key={`${key}-r${ri}`}>
                  {row.map((cell, ci) => (
                    <td
                      key={`${key}-r${ri}c${ci}`}
                      className="border-b border-line-subtle py-2 pr-4 align-top text-secondary tabular-nums"
                    >
                      {inline(cell, `${key}-r${ri}c${ci}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flushPara(key);
      bullets.push(bullet[1]!);
      continue;
    }

    flushBullets(key);
    para.push(trimmed);
  }
  flushPara("tail");
  flushBullets("tail-b");

  return <div className="space-y-3">{blocks}</div>;
}
